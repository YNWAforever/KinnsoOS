import { apiContext, failure, reply } from '../../../../../lib/api/server';
import { serverClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Manual lifecycle run from the operations payments dashboard.
 *
 * The scheduled route is the normal caller; this lets an operator expire overdue
 * windows and send the final-24h reminders immediately (for example after changing the
 * scheduler). The database RPCs re-check the active-ops role, so the route check is
 * defence in depth.
 */
export async function POST(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const sweep = await client.rpc('kinnso_payment_sweep_expired');
    if (sweep.error) throw new Error(sweep.error.message);
    const reminders = await client.rpc('kinnso_payment_send_reminders');
    if (reminders.error) throw new Error(reminders.error.message);
    const expired = Number((sweep.data as { expired?: unknown } | null)?.expired ?? 0);
    const reminded = Number((reminders.data as { reminded?: unknown } | null)?.reminded ?? 0);
    return reply({ ok: true, data: { expired: Number.isFinite(expired) ? expired : 0, reminded: Number.isFinite(reminded) ? reminded : 0 } });
  } catch (error) {
    if (/forbidden/.test(error instanceof Error ? error.message : '')) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
