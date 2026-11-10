import { apiContext, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Accepted trips starting within a few days, for the signed-in traveller. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'trips');
  if (ctx.response) return ctx.response;
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_upcoming_bookings', { p_days: 3 });
    if (response.error) throw new Error(response.error.message);
    const data = (response.data ?? {}) as { traveller?: unknown[] };
    return reply({ ok: true, data: { items: Array.isArray(data.traveller) ? data.traveller : [] } });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
