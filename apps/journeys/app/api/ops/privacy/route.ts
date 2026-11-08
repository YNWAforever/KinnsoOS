import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Ops queue of recorded privacy requests. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  const url = new URL(request.url);
  const raw = url.searchParams.get('limit') ?? '50';
  const limit = /^[0-9]{1,3}$/.test(raw) ? Number(raw) : 50;
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_privacy_requests', { p_limit: limit });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function PATCH(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  let input: unknown;
  try {
    input = await boundedBody(request, 8192);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { id?: unknown; status?: unknown; note?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return failure('INVALID', 400);
  if (body.status !== 'received' && body.status !== 'in_progress' && body.status !== 'completed' && body.status !== 'rejected') return failure('INVALID', 400);
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 1000)) return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_update_privacy_request', {
      p_id: body.id,
      p_status: body.status,
      p_note: typeof body.note === 'string' ? body.note : '',
    });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/invalid_/.test(message)) return failure('INVALID', 400);
    if (/request_not_found/.test(message)) return failure('NOT_FOUND', 404);
    if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
