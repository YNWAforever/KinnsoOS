import { failure, reply } from '../../../../lib/api/server';
import { cronAccess } from '../../../../lib/telemetry/cron-auth';
import { flushEmailOutbox } from '../../../../lib/email/flush';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Sender cron for the email outbox (E2).
 *
 * Cron-credential-gated like the health alert. It does nothing until an operator
 * enables the outbox flag and a provider is configured; with no provider it reports
 * `provider-not-configured` rather than pretending to send. Each due row is claimed
 * before sending, so overlapping runs cannot double-send, and failures retry with
 * backoff before going to `failed`.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    const result = await safeFlush();
    return reply({ ok: true, data: { ...result, skippedReason: 'cron-secret-not-configured' } });
  }
  const denied = cronAccess(request, process.env);
  if (denied) return failure(denied, denied === 'FORBIDDEN' ? 403 : 401);
  const result = await safeFlush();
  return reply({ ok: true, data: result });
}

async function safeFlush() {
  try {
    return await flushEmailOutbox(process.env);
  } catch (error) {
    return { provider: 'unknown', configured: false, processed: 0, sent: 0, failed: 0, skipped: 0, reason: (error instanceof Error ? error.message : 'flush-failed').slice(0, 160) };
  }
}
