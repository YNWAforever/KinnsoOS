import { apiContext, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Traveller withdraws their own still-undecided request. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'trips', true);
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_withdraw_booking_request', { p_id: id });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/request_not_found_or_decided/.test(message)) return failure('CONFLICT', 409);
    if (/actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
