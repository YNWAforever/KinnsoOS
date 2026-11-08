import { apiContext, failure, reply } from '../../../../../lib/api/server';
import { alertDestination, deliverAlert } from '../../../../../lib/ops/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Operator self-test: send one alert through the real delivery path.
 *
 * This proves the configured destination accepts deliveries without waiting for an
 * incident. It is session-gated (ops), never cron-secret-gated, so a leaked
 * scheduler secret cannot be used to send mail on the owner's behalf. */
export async function POST(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  const destination = alertDestination(process.env);
  if (!destination.configured) return failure('UNAVAILABLE', 503);
  const result = await deliverAlert(
    {
      text: 'KinnsoOS alert self-test: delivery path works end to end. No incident is implied.',
      state: 'test',
      site: process.env.KINNSO_SITE_URL ?? '',
      checkedAt: new Date().toISOString(),
    },
    process.env,
  );
  if (!result.delivered) return failure('UNAVAILABLE', 503);
  return reply({ ok: true, data: { delivered: true, status: result.status } });
}
