import { failure, reply } from '../../../../lib/api/server';
import { cronAccess } from '../../../../lib/telemetry/cron-auth';
import { alertDestination, deliverAlert } from '../../../../lib/ops/alerts';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Snapshot = {
  snapshotAt: string;
  publishedGuides: number;
  syntheticGuides: number;
  attestedGuides: number;
  verifiedGuides: number;
  chatTurnsUsedThisHour: number;
};

type State = 'ok' | 'unavailable' | 'cost-exhausted' | 'content-not-ready';

/** Scheduled health alerting.
 *
 * Runs without a user session (cron credential only) and uses the aggregate-only
 * public health RPC, so no secret service key is required. It alerts only when
 * something needs a human:
 *  - `unavailable`: the snapshot could not be read at all (repeats each run during
 *    an outage: a monitor that goes quiet on failure is worse than a noisy one).
 *  - `cost-exhausted`: the hourly chat budget is spent (sent once per hour, on the
 *    :00 run).
 *  - `content-not-ready`: one daily digest at 08:00 UTC while the launch content
 *    gate is still blocked.
 *  - `ok`: nothing is sent.
 *
 * `?test=1` (also cron-credential-gated) sends one labelled test alert through the
 * same delivery path, proving the destination accepts deliveries.
 *
 * Delivery requires `KINNSO_ALERT_WEBHOOK_URL`. Without it the route still runs
 * and reports `delivered:false`, so a missing binding is visible rather than
 * silently pretending to alert. The scheduler credential is `CRON_SECRET`
 * (Vercel sends it automatically once set); without it the route no-ops so the
 * scheduled invocation never produces log noise.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return reply({ ok: true, data: { skipped: 'cron-secret-not-configured', delivered: false } });
  }
  const denied = cronAccess(request, process.env);
  if (denied) return failure(denied, denied === 'FORBIDDEN' ? 403 : 401);

  const destination = alertDestination(process.env);
  if (new URL(request.url).searchParams.get('test') === '1') {
    const result = await deliverAlert(
      {
        text: 'KinnsoOS alert self-test (scheduler path): delivery works end to end. No incident is implied.',
        state: 'test',
        site: process.env.KINNSO_SITE_URL ?? '',
        checkedAt: new Date().toISOString(),
      },
      process.env,
    );
    return result.delivered
      ? reply({ ok: true, data: { test: true, delivered: true, status: result.status } })
      : reply({ ok: true, data: { test: true, delivered: false, reason: result.reason, webhookConfigured: destination.configured } }, result.reason === 'webhook-not-configured' ? 200 : 503);
  }

  const site = process.env.KINNSO_SITE_URL ?? '';
  const target = process.env.KINNSO_SUPABASE_URL ?? '';
  const key = process.env.KINNSO_SUPABASE_PUBLISHABLE_KEY ?? '';
  const limit = Number.parseInt(process.env.KINNSO_CHAT_TURNS_PER_HOUR ?? '30', 10);
  const now = new Date();

  let state: State = 'ok';
  let snapshot: Snapshot | null = null;
  let reason = '';

  try {
    const response = await fetch(`${target}/rest/v1/rpc/kinnso_public_health`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`snapshot ${response.status}`);
    snapshot = (await response.json()) as Snapshot;
  } catch (error) {
    state = 'unavailable';
    reason = error instanceof Error ? error.message : 'snapshot unavailable';
  }

  if (state === 'unavailable') {
    // Alert on every run: repeated warnings are acceptable, silence is not.
  } else if (snapshot && Number.isFinite(limit) && snapshot.chatTurnsUsedThisHour >= limit && now.getUTCMinutes() < 15) {
    state = 'cost-exhausted';
  } else if (snapshot && snapshot.verifiedGuides === 0 && now.getUTCHours() === 8 && now.getUTCMinutes() < 15) {
    state = 'content-not-ready';
  }

  if (state === 'ok') {
    return reply({
      ok: true,
      data: { state, delivered: false, webhookConfigured: destination.configured, snapshot, site: Boolean(site) },
    });
  }

  const text =
    state === 'unavailable'
      ? `KinnsoOS alert: operational snapshot unavailable (${reason}). Scheduled health checks cannot confirm the database.`
      : state === 'cost-exhausted'
        ? `KinnsoOS alert: hourly chat budget exhausted (${snapshot?.chatTurnsUsedThisHour ?? '?'}/${limit}). Chat turns are being rejected until the window resets.`
        : `KinnsoOS digest: content gate still blocked — ${snapshot?.publishedGuides ?? 0} published, ${snapshot?.syntheticGuides ?? 0} synthetic, ${snapshot?.verifiedGuides ?? 0} verified. Launch remains HOLD.`;

  const result = await deliverAlert(
    {
      text,
      state,
      site,
      checkedAt: now.toISOString(),
      snapshot,
      limit,
    },
    process.env,
  );

  if (!result.delivered) {
    return result.reason === 'webhook-not-configured'
      ? reply({ ok: true, data: { state, delivered: false, reason: result.reason, webhookConfigured: false, snapshot } })
      : failure('UNAVAILABLE', 503);
  }
  return reply({ ok: true, data: { state, delivered: true, webhookConfigured: true, snapshot } });
}
