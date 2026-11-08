import { apiContext, failure } from '../../../lib/api/server';
import { handleMcpMessage, MCP_PROTOCOL_VERSION, MCP_SERVER_INFO } from '../../../lib/mcp/protocol';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BODY = 262144;

export async function POST(request: Request) {
  // Session-bound, read-only tool surface. The same conversation capability that
  // gates the spaces UI gates tool access; every tool re-checks ownership in SQL.
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return failure('INVALID', 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return failure('INVALID', 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      responses.push({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
      continue;
    }
    const response = await handleMcpMessage(message as { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> });
    if (response) responses.push(response);
  }

  if (!responses.length) return new Response(null, { status: 202, headers: headers(request) });
  const body = Array.isArray(payload) ? responses : responses[0];
  return Response.json(body, { headers: headers(request) });
}

function headers(request: Request) {
  return {
    'Cache-Control': 'no-store',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    'X-MCP-Server': `${MCP_SERVER_INFO.name}@${MCP_SERVER_INFO.version}`,
    Vary: 'Cookie',
    'X-Request-Method': request.method,
  };
}

export async function GET(request: Request) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  // No server-initiated stream: this server only answers POSTed JSON-RPC messages.
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'SSE stream not offered; use POST' } },
    { status: 405, headers: { ...headers(request), Allow: 'POST' } },
  );
}
