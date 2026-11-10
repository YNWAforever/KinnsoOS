import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

type CursorToken = { p?: number; c?: string; i?: string };
function decodeCursor(raw: string | null): CursorToken | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorToken;
    if (!parsed || typeof parsed.c !== 'string' || typeof parsed.i !== 'string') return null;
    if (!/^[0-9a-f-]{36}$/i.test(parsed.i) || Number.isNaN(new Date(parsed.c).getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}
function encodeCursor(value: CursorToken): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}


function mapError(message: string) {
  if (/creator_required|actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/request_not_found_or_decided/.test(message)) return failure('CONFLICT', 409);
  if (/invalid_/.test(message)) return failure('INVALID', 400);
  return failure('UNAVAILABLE', 503);
}

/** Creator inbox for request-to-book inquiries. No traveller contact details are stored. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'creator');
  if (ctx.response) return ctx.response;
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const cursor = decodeCursor(new URL(request.url).searchParams.get('cursor'));
    const response = await client.rpc('kinnso_creator_booking_requests', {
      p_limit: 50,
      p_cursor_pending: cursor?.p ?? null,
      p_cursor_created_at: cursor?.c ?? null,
      p_cursor_id: cursor?.i ?? null,
    });
    if (response.error) throw new Error(response.error.message);
    const data = (response.data ?? {}) as { items?: Array<{ id: string; status: string; createdAt: string }>; hasMore?: boolean };
    const items = Array.isArray(data.items) ? data.items : [];
    const last = items[items.length - 1];
    const nextCursor = data.hasMore === true && last ? encodeCursor({ p: last.status === 'requested' ? 0 : 1, c: last.createdAt, i: last.id }) : null;
    return reply({ ok: true, data: { items, hasMore: data.hasMore === true, nextCursor } });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}

export async function PATCH(request: Request) {
  const ctx = await apiContext(request, 'creator', true);
  if (ctx.response) return ctx.response;
  let input: unknown;
  try {
    input = await boundedBody(request, 4096);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { id?: unknown; status?: unknown; note?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return failure('INVALID', 400);
  if (body.status !== 'accepted' && body.status !== 'declined') return failure('INVALID', 400);
  if (body.note !== undefined && body.note !== null && (typeof body.note !== 'string' || body.note.length > 500)) return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_respond_booking_request', { p_id: body.id, p_status: body.status, p_note: typeof body.note === 'string' ? body.note : null });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
