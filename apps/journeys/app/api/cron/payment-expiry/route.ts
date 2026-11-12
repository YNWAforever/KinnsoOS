import { failure, reply } from '../../../../lib/api/server';
import { sendPaymentReminders, sweepExpiredPayments } from '../../../../lib/payments/expiry';
import { cronAccess } from '../../../../lib/telemetry/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Scheduler entry point for the payment window lifecycle.
 *
 * Cron-credential-gated. With no scheduler credential the endpoint is a no-op (it must
 * not mutate money state from an unauthenticated request); with the wrong credential
 * it refuses; with the right one it:
 * - expires windows past their deadline (one ledger event + notices per payment), and
 * - reminds travellers inside the final 24 hours (one reminder per payment).
 * Both are idempotent: expired rows leave the unpaid states, and reminder_sent_at is
 * set in the same statement that returns the row to notify.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return reply({ ok: true, data: { configured: false, expired: 0, reminded: 0, skipped: 'cron-secret-not-configured' } });
  }
  const denied = cronAccess(request, process.env);
  if (denied) return failure(denied, denied === 'FORBIDDEN' ? 403 : 401);
  try {
    const sweep = await sweepExpiredPayments();
    const reminders = await sendPaymentReminders();
    return reply({ ok: true, data: { configured: sweep.configured && reminders.configured, expired: sweep.expired, reminded: reminders.reminded } });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
