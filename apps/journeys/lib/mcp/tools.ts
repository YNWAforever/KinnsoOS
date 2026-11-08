import { getThread, listMyTrips, searchGuides, workspaceSummary } from '../chat/server';

export type McpToolResult = { structured: unknown; summary: string };

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true; destructiveHint: false; openWorldHint: false };
  run: (args: Record<string, unknown>) => Promise<McpToolResult>;
};

function numberArg(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
}

function stringArg(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function preview(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 1800 ? text.slice(0, 1800) + '…' : text;
}

export const MCP_TOOLS: ToolDefinition[] = [
  {
    name: 'kinnso_search_guides',
    description:
      'Search published Kinnso guides by title, summary, city or creator. Returns read-only results; never invents guides.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query. Omit to list the most recent published guides.' },
        limit: { type: 'number', description: '1–20 results (default 5).' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async run(args) {
      const query = stringArg(args.query, 200);
      const limit = numberArg(args.limit, 5, 1, 20);
      const result = await searchGuides(query, limit);
      const count = Array.isArray(result?.items) ? result.items.length : 0;
      return { structured: result, summary: count ? `${count} published guide(s) returned` : 'No published guides matched' };
    },
  },
  {
    name: 'kinnso_list_my_trips',
    description: 'List the signed-in traveller’s own trips (read-only, owner-scoped).',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: '1–50 trips (default 10).' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async run(args) {
      const result = await listMyTrips(numberArg(args.limit, 10, 1, 50));
      const count = Array.isArray(result?.items) ? result.items.length : 0;
      return { structured: result, summary: count ? `${count} trip(s) returned` : 'This account has no saved trips yet' };
    },
  },
  {
    name: 'kinnso_workspace_summary',
    description: 'Summarise the signed-in account’s roles and their spaces, chats and message counts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async run() {
      const result = await workspaceSummary();
      return { structured: result, summary: `roles=${JSON.stringify((result as { roles?: unknown }).roles ?? [])}` };
    },
  },
  {
    name: 'kinnso_read_chat',
    description: 'Read the recent messages of one of the signed-in account’s own chats (owner-scoped).',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Chat id (uuid) owned by this account.' },
        limit: { type: 'number', description: 'Most recent 1–50 messages (default 20).' },
      },
      required: ['threadId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async run(args) {
      const threadId = stringArg(args.threadId, 64);
      if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw Object.assign(new Error('invalid_thread_id'), { code: 'INVALID' });
      const limit = numberArg(args.limit, 20, 1, 50);
      const thread = await getThread(threadId);
      const messages = Array.isArray(thread?.messages) ? thread.messages.slice(-limit) : [];
      return {
        structured: { id: thread?.id, title: thread?.title, messages: messages.map((m) => ({ role: m.role, body: m.body })) },
        summary: `${messages.length} recent message(s) read`,
      };
    },
  },
];

export const MCP_TOOL_MAP = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

export function mcpToolList() {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }));
}

export async function callMcpTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const tool = MCP_TOOL_MAP.get(name);
  if (!tool) throw Object.assign(new Error('unknown_tool'), { code: 'UNKNOWN_TOOL' });
  const result = await tool.run(args ?? {});
  return result;
}

export { preview as mcpPreview };
