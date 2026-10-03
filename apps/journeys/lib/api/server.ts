import { serverClient } from '../supabase/server';
import { capabilities } from '../contracts/capabilities';
import type { ErrorCode } from '../contracts/capabilities';
import { sameOrigin } from './validation';

export function reply(data: unknown, status = 200) {
  return Response.json(data, {status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
export function failure(code: ErrorCode, status: number) {
  return reply({ok:false,code,retryable:code === 'UNAVAILABLE',requestId:crypto.randomUUID()}, status);
}
export function backendFailure(error: {message?:string; code?:string} | null) {
  const message = error?.message ?? '';
  if (/trip_not_found|guide_not_found|media_not_found|share_not_found/.test(message)) return failure('NOT_FOUND',404);
  if (/revision_conflict|idempotency_conflict/.test(message)) return failure('CONFLICT',409);
  if (/unauthenticated/.test(message)) return failure('AUTH_REQUIRED',401);
  if (/forbidden|creator_required/.test(message)) return failure('FORBIDDEN',403);
  if (/invalid_|source_unavailable|guide_summary/.test(message) || error?.code?.startsWith('22') || error?.code === '23514') return failure('INVALID',400);
  return failure('UNAVAILABLE',503);
}
export async function apiContext(request: Request, capability: string, write = false) {
  if (write && !sameOrigin(request,process.env.KINNSO_SITE_URL)) return {response:failure('FORBIDDEN',403)} as const;
  if (capabilities(process.env)[capability]?.mode !== 'connected') return {response:failure('UNAVAILABLE',503)} as const;
  const client = await serverClient();
  if (!client) return {response:failure('UNAVAILABLE',503)} as const;
  const {data:{user},error} = await client.auth.getUser();
  if (error || !user) return {response:failure('AUTH_REQUIRED',401)} as const;
  // The RPC also verifies the current auth.sessions row and authoritative roles.
  const actor = await client.rpc('kinnso_actor');
  if (actor.error || actor.data?.id !== user.id) return {response:failure('AUTH_REQUIRED',401)} as const;
  return {client,actor:actor.data} as const;
}
export async function boundedBody(request: Request, max = 262144): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > max) throw new Error('INVALID');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; total += chunk.value.byteLength;
      if (total > max) { await reader.cancel(); throw new Error('INVALID'); } chunks.push(chunk.value); }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
