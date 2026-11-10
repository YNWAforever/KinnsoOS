import type { McpClient } from '../mcp/client';
import type { ChatToolSource } from '../chat/contracts';
import { mergeToolSources, toolSources } from '../chat/contracts';

export type ChatTurnEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; id: string; name: string; status: 'running' | 'done' | 'error'; summary?: string; sources?: ChatToolSource[] }
  | { type: 'final'; text: string; tools: Array<{ name: string; ok: boolean; summary?: string }>; model: string; sources?: ChatToolSource[] };

export type ChatTurnInput = {
  locale: 'en' | 'zh-HK';
  history: Array<{ role: 'user' | 'assistant'; body: string }>;
  question: string;
  threadId: string;
  mcp: McpClient;
  signal: AbortSignal;
  emit: (event: ChatTurnEvent) => void;
};

type ProviderConfig = { baseUrl: string; apiKey: string; modelId: string };

const MAX_STEPS = 4;

export function modelConfig(): ProviderConfig | null {
  const baseUrl = (process.env.KINNSO_MODEL_BASE_URL ?? '').replace(/\/+$/, '');
  const apiKey = process.env.KINNSO_MODEL_API_KEY ?? '';
  const modelId = process.env.KINNSO_MODEL_ID ?? '';
  if (!baseUrl || !apiKey || !modelId) return null;
  try {
    const url = new URL(baseUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
  } catch {
    return null;
  }
  return { baseUrl, apiKey, modelId };
}

export function modelConfigured(): boolean {
  return modelConfig() !== null;
}

function systemPrompt(locale: 'en' | 'zh-HK', toolNames: string[]): string {
  const language = locale === 'zh-HK' ? 'Answer in Traditional Chinese (zh-HK).' : 'Answer in English.';
  return [
    'You are the KinnsoOS spaces assistant, a continuous multi-turn conversation with the signed-in account.',
    language,
    `You have access to these read-only MCP tools: ${toolNames.join(', ')}.`,
    'Call a tool whenever the answer depends on the account’s data, published guides or trips. Never invent guides, trips, prices or account facts that a tool did not return.',
    'If a tool returns no results, say so plainly and suggest the next step. Keep answers concise and keep following the thread of the conversation.',
    'You cannot write to the database, send messages, publish content, book or pay.',
  ].join(' ');
}

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

type ToolCallAccumulator = { id: string; name: string; arguments: string };

async function streamCompletion(
  config: ProviderConfig,
  messages: OpenAiMessage[],
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  signal: AbortSignal,
  onDelta: (text: string) => void,
  sessionId: string,
): Promise<{ text: string; toolCalls: ToolCallAccumulator[] }> {
  const sessionHeader = process.env.KINNSO_MODEL_SESSION_HEADER ?? '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + config.apiKey,
    // Gateways such as OpenCode Go ask clients to identify themselves and to send
    // a stable per-conversation session id for routing and prompt caching.
    'User-Agent': 'kinnsoos-spaces/1.0',
  };
  if (sessionHeader && sessionId) headers[sessionHeader] = sessionId;
  const response = await fetch(config.baseUrl + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.modelId,
      stream: true,
      messages,
      tools: tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      })),
      tool_choice: 'auto',
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error('MODEL_HTTP_' + response.status + ' ' + detail.slice(0, 200)), { code: 'UNAVAILABLE' });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const calls = new Map<number, ToolCallAccumulator>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
        }>;
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content;
        onDelta(delta.content);
      }
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? calls.size;
        const existing = calls.get(index) ?? { id: '', name: '', arguments: '' };
        if (call.id) existing.id = call.id;
        if (call.function?.name) existing.name = call.function.name;
        if (call.function?.arguments) existing.arguments += call.function.arguments;
        calls.set(index, existing);
      }
    }
  }

  return { text, toolCalls: [...calls.values()].filter((call) => call.name) };
}

const CITY_ALIASES: Array<[RegExp, string]> = [
  [/京都/, 'Kyoto'],
  [/大阪/, 'Osaka'],
  [/東京|东京/, 'Tokyo'],
  [/香港/, 'Hong Kong'],
  [/台北/, 'Taipei'],
  [/首爾|首尔/, 'Seoul'],
  [/曼谷/, 'Bangkok'],
  [/新加坡/, 'Singapore'],
  [/里斯本/, 'Lisbon'],
];

function keywordFallback(locale: 'en' | 'zh-HK', question: string): { tool: string; args: Record<string, unknown> } {
  const text = question.toLowerCase();
  const guideHint = /guide|攻略|推薦|推荐|路線|route|city|城市|景點|景点|藏書|收藏/.test(text);
  const tripHint = /trip|行程|旅程|旅行|itinerary/.test(text);
  if (guideHint) {
    const city = CITY_ALIASES.find(([pattern]) => pattern.test(question))?.[1];
    const latin = (question.match(/[A-Za-z][A-Za-z\s-]{1,40}/g) ?? []).map((part) => part.trim()).filter((part) => part.length > 2);
    const query = city ?? latin[0] ?? '';
    return { tool: 'kinnso_search_guides', args: { query, limit: 5 } };
  }
  if (tripHint) return { tool: 'kinnso_list_my_trips', args: { limit: 10 } };
  return { tool: 'kinnso_workspace_summary', args: {} };
}

function compactToolSummary(structured: unknown): string {
  const items = structured && typeof structured === 'object' && Array.isArray((structured as { items?: unknown }).items)
    ? (structured as { items: unknown[] }).items
    : null;
  if (items) return items.length ? `${items.length} result(s)` : 'no results';
  if (structured && typeof structured === 'object') {
    const keys = Object.keys(structured as Record<string, unknown>);
    return keys.length ? keys.slice(0, 3).join(', ') : 'ok';
  }
  return 'ok';
}

function renderToolResult(locale: 'en' | 'zh-HK', structured: unknown): string {
  const items = structured && typeof structured === 'object' && Array.isArray((structured as { items?: unknown }).items)
    ? ((structured as { items: unknown[] }).items)
    : null;
  if (items) {
    if (!items.length) return locale === 'zh-HK' ? '沒有符合的已發布攻略。' : 'No published guides matched.';
    return items.slice(0, 5).map((raw) => {
      const item = raw as { title?: string; city?: string; summary?: string };
      return `- ${item.title ?? ''}${item.city ? ' · ' + item.city : ''}${item.summary ? '\n  ' + item.summary.slice(0, 160) : ''}`;
    }).join('\n');
  }
  const text = JSON.stringify(structured);
  return text && text.length > 800 ? text.slice(0, 800) + '…' : (text ?? '');
}

/**
 * One turn of the continuous conversation. With a configured OpenAI-compatible
 * model this streams model deltas and runs a real MCP tool loop. Without a model
 * key it still calls the MCP tools and answers from their output, labelled as
 * such, so the surface is usable and never fabricates a model response.
 */
export async function runChatTurn(input: ChatTurnInput): Promise<{ text: string; tools: Array<{ name: string; ok: boolean; summary?: string }>; model: string; sources: ChatToolSource[] }> {
  const config = modelConfig();
  const tools = input.mcp.tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  const toolTraces: Array<{ name: string; ok: boolean; summary?: string }> = [];
  // One bounded source group per tool call; merged/deduped for the final reply.
  const collectedSources: ChatToolSource[][] = [];

  if (!config) {
    const { tool, args } = keywordFallback(input.locale, input.question);
    input.emit({ type: 'tool', id: 'fallback-1', name: tool, status: 'running' });
    let summary = '';
    let structured: unknown = null;
    let ok = true;
    try {
      const result = await input.mcp.call(tool, args);
      structured = result.structured;
      summary = result.summary;
      const sources = toolSources(structured);
      collectedSources.push(sources);
      input.emit({ type: 'tool', id: 'fallback-1', name: tool, status: 'done', summary, ...(sources.length ? { sources } : {}) });
    } catch (error) {
      ok = false;
      summary = error instanceof Error ? error.message : 'tool failed';
      input.emit({ type: 'tool', id: 'fallback-1', name: tool, status: 'error', summary });
    }
    toolTraces.push({ name: tool, ok, summary: ok ? compactToolSummary(structured) : summary });
    const header = input.locale === 'zh-HK'
      ? '（示範模式：未設定模型金鑰，以下是實際 MCP 工具結果，不是模型生成。）'
      : '(Demo mode: no model key configured. The text below is the actual MCP tool result, not a model answer.)';
    const rendered = ok ? renderToolResult(input.locale, structured) : summary;
    const text = [
      header,
      input.locale === 'zh-HK' ? `工具：${tool}` : `Tool: ${tool}`,
      rendered,
      input.locale === 'zh-HK'
        ? '設定 KINNSO_MODEL_BASE_URL／KINNSO_MODEL_API_KEY／KINNSO_MODEL_ID 後，即可以模型延續同一段對話。'
        : 'Set KINNSO_MODEL_BASE_URL, KINNSO_MODEL_API_KEY and KINNSO_MODEL_ID to continue this conversation with a model.',
    ].filter(Boolean).join('\n\n');
    for (const piece of text.match(/[\s\S]{1,120}/g) ?? []) input.emit({ type: 'delta', text: piece });
    return { text, tools: toolTraces, model: 'none:tool-grounded', sources: mergeToolSources(collectedSources) };
  }

  const messages: OpenAiMessage[] = [
    { role: 'system', content: systemPrompt(input.locale, tools.map((tool) => tool.name)) },
    ...input.history.slice(-20).map((message) => ({ role: message.role, content: message.body }) as OpenAiMessage),
    { role: 'user', content: input.question },
  ];

  let finalText = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const { text, toolCalls } = await streamCompletion(config, messages, tools, input.signal, (delta) => {
      input.emit({ type: 'delta', text: delta });
    }, input.threadId);
    finalText += text;
    if (!toolCalls.length) break;

    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } })),
    });

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      input.emit({ type: 'tool', id: call.id, name: call.name, status: 'running' });
      let ok = true;
      let summary = '';
      let structured: unknown = null;
      try {
        const result = await input.mcp.call(call.name, args);
        structured = result.structured;
        summary = result.summary;
        const sources = toolSources(structured);
        collectedSources.push(sources);
        input.emit({ type: 'tool', id: call.id, name: call.name, status: 'done', summary, ...(sources.length ? { sources } : {}) });
      } catch (error) {
        ok = false;
        summary = error instanceof Error ? error.message : 'tool failed';
        input.emit({ type: 'tool', id: call.id, name: call.name, status: 'error', summary });
      }
      toolTraces.push({ name: call.name, ok, summary: ok ? compactToolSummary(structured) : summary });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(ok ? structured : { error: summary }).slice(0, 12000),
      });
    }
  }

  const sources = mergeToolSources(collectedSources);
  input.emit({ type: 'final', text: finalText, tools: toolTraces, model: config.modelId, sources });
  return { text: finalText, tools: toolTraces, model: config.modelId, sources };
}
