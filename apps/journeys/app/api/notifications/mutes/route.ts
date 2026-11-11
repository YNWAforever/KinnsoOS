import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

const EVENT_TYPES = ['booking.requested', 'booking.withdrawn', 'booking.accepted', 'booking.declined', 'booking.dates_blocked', 'booking.paid', 'booking.payment_received'] as const;

/** Per-event in-app notification mutes for the signed-in account. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'notifications');
  if (ctx.response) return ctx.response;
  try {
    const response = await ctx.client.rpc('kinnso_get_notification_mutes');
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: { mutes: response.data ?? [] } });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function PUT(request: Request) {
  const ctx = await apiContext(request, 'notifications', true);
  if (ctx.response) return ctx.response;
  let input: unknown;
  try {
    input = await boundedBody(request, 2048);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { eventType?: unknown; muted?: unknown } | null;
  if (!body || typeof body.eventType !== 'string' || !(EVENT_TYPES as readonly string[]).includes(body.eventType)) {
    return failure('INVALID', 400);
  }
  if (typeof body.muted !== 'boolean') return failure('INVALID', 400);
  try {
    const response = await ctx.client.rpc('kinnso_set_notification_mute', { p_event_type: body.eventType, p_muted: body.muted });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
