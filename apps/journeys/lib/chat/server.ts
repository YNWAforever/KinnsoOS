import { serverClient } from '../supabase/server';
import type { ChatSpace, ChatThread, ChatThreadDetail } from './contracts';

type RpcError = { message?: string; code?: string } | null;
type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError }>;
};

function client(unknownClient: unknown): RpcClient {
  return unknownClient as RpcClient;
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await serverClient();
  if (!supabase) throw Object.assign(new Error('UNAVAILABLE'), { code: 'UNAVAILABLE' });
  const result = await client(supabase).rpc(name, args);
  if (result.error) throw Object.assign(new Error(result.error.message ?? 'RPC_FAILED'), { code: result.error.code ?? 'RPC_FAILED' });
  return result.data as T;
}

export async function listSpaces(): Promise<ChatSpace[]> {
  const data = await call<{ items: ChatSpace[] }>('chat_list_spaces');
  return data?.items ?? [];
}

export function createSpace(id: string, name: string, description = ''): Promise<ChatSpace> {
  return call<ChatSpace>('chat_create_space', { p_id: id, p_name: name, p_description: description });
}

export function deleteSpace(id: string): Promise<{ deleted: boolean }> {
  return call<{ deleted: boolean }>('chat_delete_space', { p_id: id });
}

export async function listThreads(spaceId: string): Promise<ChatThread[]> {
  const data = await call<{ items: ChatThread[] }>('chat_list_threads', { p_space_id: spaceId });
  return data?.items ?? [];
}

export function createThread(id: string, spaceId: string, title = ''): Promise<ChatThread> {
  return call<ChatThread>('chat_create_thread', { p_id: id, p_space_id: spaceId, p_title: title });
}

export function deleteThread(id: string): Promise<{ deleted: boolean }> {
  return call<{ deleted: boolean }>('chat_delete_thread', { p_id: id });
}

export function renameThread(id: string, title: string): Promise<{ id: string; title: string }> {
  return call<{ id: string; title: string }>('chat_rename_thread', { p_id: id, p_title: title });
}

export function getThread(threadId: string): Promise<ChatThreadDetail> {
  return call<ChatThreadDetail>('chat_get_thread', { p_thread_id: threadId });
}

export function appendMessage(
  threadId: string,
  requestId: string,
  role: 'user' | 'assistant' | 'tool',
  body: string,
  toolName: string | null = null,
  toolPayload: Record<string, unknown> = {},
): Promise<{ id: string; threadId: string; sequence: number; role: string }> {
  return call('chat_append_message', {
    p_thread_id: threadId,
    p_request_id: requestId,
    p_role: role,
    p_body: body,
    p_tool_name: toolName,
    p_tool_payload: toolPayload,
  });
}

export function searchGuides(query: string, limit = 5): Promise<{ items: unknown[]; query: string | null }> {
  return call('mcp_search_guides', { p_query: query, p_limit: limit });
}

export function listMyTrips(limit = 10): Promise<{ items: unknown[] }> {
  return call('mcp_list_my_trips', { p_limit: limit });
}

export function workspaceSummary(): Promise<Record<string, unknown>> {
  return call('mcp_workspace_summary');
}

export function reserveChatTurn(limit = 30): Promise<{ allowed: boolean; used: number; limit: number; resetAt: string }> {
  return call('chat_reserve_turn', { p_limit: limit });
}
