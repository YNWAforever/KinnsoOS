import { apiContext, failure, reply } from '../../../../../lib/api/server';
import { serverClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Manual sweep from the operations payments dashboard.
 *
 * The scheduled route is the normal caller; this lets an operator clear overdue
 * windows immediately (for example after changing the scheduler). The database RPC
 * re-checks the active-ops role, so the route check is defence in depth.
 */
export async function POST(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_payment_sweep_expired');
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    if (/forbidden/.test(error instanceof Error ? error.message : '')) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
