import { callMcpTool, mcpPreview, mcpToolList } from './tools';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_INFO = { name: 'kinnsoos-spaces', version: '1.0.0', title: 'KinnsoOS spaces tools' };

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type JsonRpcResponse = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const methodNotFound = (id: string | number | null): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code: -32601, message: 'Method not found' },
});

const invalidRequest = (id: string | number | null, message: string): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code: -32600, message },
});

export async function handleMcpMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return invalidRequest(id, 'Invalid JSON-RPC request');
  const params = message.params ?? {};
  switch (message.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: MCP_SERVER_INFO,
          instructions:
            'Read-only KinnsoOS tools. Guides are public content; trips and chats are scoped to the signed-in account. Never invent data that a tool did not return.',
        },
      };
    case 'notifications/initialized':
      return null;
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: mcpToolList() } };
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};
      try {
        const result = await callMcpTool(name, args);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: mcpPreview(result.structured) }],
            structuredContent: result.structured,
            isError: false,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'tool_failed';
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: message }], isError: true },
        };
      }
    }
    default:
      return methodNotFound(id);
  }
}
