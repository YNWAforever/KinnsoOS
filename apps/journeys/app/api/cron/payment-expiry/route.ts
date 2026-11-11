import { failure, reply } from '../../../../lib/api/server';
import { sweepExpiredPayments } from '../../../../lib/payments/expiry';
import { cronAccess } from '../../../../lib/telemetry/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Scheduler entry point for expired payment windows.
 *
 * Cron-credential-gated. With no scheduler credential the endpoint is a no-op (it must
 * not mutate money state from an unauthenticated request); with the wrong credential
 * it refuses; with the right one it sweeps deadlines and reports how many windows
 * expired. Safe to run repeatedly: only rows past their deadline change, and each
 * payment gets at most one expiry event.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return reply({ ok: true, data: { configured: false, expired: 0, skipped: 'cron-secret-not-configured' } });
  }
  const denied = cronAccess(request, process.env);
  if (denied) return failure(denied, denied === 'FORBIDDEN' ? 403 : 401);
  try {
    return reply({ ok: true, data: await sweepExpiredPayments() });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
