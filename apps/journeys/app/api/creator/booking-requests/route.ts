import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

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
    const response = await client.rpc('kinnso_creator_booking_requests', { p_limit: 50 });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
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
  const body = input as { id?: unknown; status?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return failure('INVALID', 400);
  if (body.status !== 'accepted' && body.status !== 'declined') return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_respond_booking_request', { p_id: body.id, p_status: body.status });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
