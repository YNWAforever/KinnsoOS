import { apiContext, boundedBody, failure, reply } from '../../../lib/api/server';
import { serverClient } from '../../../lib/supabase/server';

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
  if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
  if (/rate_limited/.test(message)) return failure('UNAVAILABLE', 429);
  if (/invalid_|self_request|synthetic_guide|creator_unavailable|dates_unavailable/.test(message)) return failure('INVALID', 400);
  if (/actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
  return failure('UNAVAILABLE', 503);
}

/** Submit a request to book a published guide. Request-only: no payment, no confirmation. */
export async function POST(request: Request) {
  const ctx = await apiContext(request, 'trips', true);
  if (ctx.response) return ctx.response;
  let input: unknown;
  try {
    input = await boundedBody(request, 8192);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { guideId?: unknown; startsOn?: unknown; endsOn?: unknown; partySize?: unknown; message?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.guideId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.guideId)) return failure('INVALID', 400);
  if (typeof body.startsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.startsOn)) return failure('INVALID', 400);
  if (body.endsOn !== undefined && body.endsOn !== null && (typeof body.endsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.endsOn))) return failure('INVALID', 400);
  if (typeof body.partySize !== 'number' || !Number.isInteger(body.partySize) || body.partySize < 1 || body.partySize > 20) return failure('INVALID', 400);
  if (body.message !== undefined && (typeof body.message !== 'string' || body.message.length > 1000)) return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_request_booking', {
      p_guide_id: body.guideId,
      p_starts_on: body.startsOn,
      p_ends_on: typeof body.endsOn === 'string' ? body.endsOn : null,
      p_party_size: body.partySize,
      p_message: typeof body.message === 'string' ? body.message : '',
    });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data }, 201);
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}

/** Traveller's own booking requests. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'trips');
  if (ctx.response) return ctx.response;
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const cursor = decodeCursor(new URL(request.url).searchParams.get('cursor'));
    const response = await client.rpc('kinnso_my_booking_requests', {
      p_limit: 50,
      p_cursor_created_at: cursor?.c ?? null,
      p_cursor_id: cursor?.i ?? null,
    });
    if (response.error) throw new Error(response.error.message);
    const data = (response.data ?? {}) as { items?: Array<{ id: string; createdAt: string }>; hasMore?: boolean };
    const items = Array.isArray(data.items) ? data.items : [];
    const last = items[items.length - 1];
    const nextCursor = data.hasMore === true && last ? encodeCursor({ c: last.createdAt, i: last.id }) : null;
    return reply({ ok: true, data: { items, hasMore: data.hasMore === true, nextCursor } });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
