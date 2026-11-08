import { MCP_PROTOCOL_VERSION } from './protocol';

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type JsonRpcResult<T> = { jsonrpc: '2.0'; id: string | number; result?: T; error?: { code: number; message: string } };

export type McpClient = {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  tools: McpTool[];
  call: (name: string, args: Record<string, unknown>) => Promise<{ structured: unknown; summary: string }>;
};

type RpcEnvelope<T> = { result?: T; error?: { code: number; message: string; data?: unknown } };

type JsonRpcResponse<T> = JsonRpcResult<T> | Array<JsonRpcResult<T>>;

function endpoint(): string {
  const base = (process.env.KINNSO_SITE_URL ?? '').replace(/\/+$/, '');
  if (!base) throw Object.assign(new Error('MCP_ENDPOINT_NOT_CONFIGURED'), { code: 'UNAVAILABLE' });
  return base + '/api/mcp';
}

async function rpc<T>(cookie: string, method: string, params: Record<string, unknown> = {}, id = 1): Promise<T> {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      Cookie: cookie,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const payload = (await response.json().catch(() => null)) as JsonRpcResponse<RpcEnvelope<T>> | null;
  if (!response.ok || !payload) throw Object.assign(new Error('MCP_HTTP_' + response.status), { code: 'UNAVAILABLE' });
  const envelope = Array.isArray(payload) ? payload[0] : payload;
  if (!envelope) throw Object.assign(new Error('MCP_EMPTY_RESPONSE'), { code: 'MCP_PROTOCOL_ERROR' });
  if (envelope.error) throw Object.assign(new Error(envelope.error.message), { code: 'MCP_PROTOCOL_ERROR' });
  const value = envelope.result as T & { error?: { message: string } } | undefined;
  if (value && typeof value === 'object' && 'error' in value && value.error) {
    throw Object.assign(new Error(value.error.message), { code: 'MCP_TOOL_ERROR' });
  }
  return value as T;
}

/**
 * Real MCP client handshake against the KinnsoOS MCP server:
 * initialize -> (notifications/initialized) -> tools/list, then tools/call per turn.
 * The caller's session cookie is forwarded, so tools run as that actor.
 */
export async function connectMcp(cookie: string): Promise<McpClient> {
  const init = await rpc<{ protocolVersion: string; serverInfo: { name: string; version: string } }>(cookie, 'initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'kinnsoos-spaces', version: '1.0.0' },
  });
  // Notification has no response; failures here are not fatal for tool use.
  await fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  }).catch(() => undefined);
  const listed = await rpc<{ tools: McpTool[] }>(cookie, 'tools/list', {}, 2);
  let sequence = 3;
  return {
    protocolVersion: init.protocolVersion,
    serverInfo: init.serverInfo,
    tools: listed.tools ?? [],
    async call(name, args) {
      const result = await rpc<{
        content: Array<{ type: string; text?: string }>;
        structuredContent?: unknown;
        isError?: boolean;
      }>(cookie, 'tools/call', { name, arguments: args }, sequence++);
      if (result.isError) {
        const text = result.content?.map((part) => part.text ?? '').join(' ').trim();
        throw Object.assign(new Error(text || 'tool_failed'), { code: 'MCP_TOOL_ERROR' });
      }
      const text = result.content?.map((part) => part.text ?? '').join(' ').trim() ?? '';
      return { structured: result.structuredContent ?? text, summary: text.slice(0, 400) };
    },
  };
}

export function mcpConfigured(): boolean {
  return Boolean(process.env.KINNSO_SITE_URL);
}
