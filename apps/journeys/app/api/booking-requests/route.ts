import { apiContext, boundedBody, failure, reply } from '../../../lib/api/server';
import { serverClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

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
    const offset = Math.max(0, Math.min(100000, Number(new URL(request.url).searchParams.get('offset') ?? '0') || 0));
    const response = await client.rpc('kinnso_my_booking_requests', { p_limit: 50, p_offset: offset });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data ?? { items: [], hasMore: false } });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
