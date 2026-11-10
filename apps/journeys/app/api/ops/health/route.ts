import { apiContext, failure, reply } from '../../../../lib/api/server';
import { contentReadiness } from '../../../../lib/content-honesty/server';
import { usage } from '../../../../lib/chat/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

type Check = { id: string; status: 'ok' | 'degraded' | 'fail'; detail: string; ms: number };

/** Ops-only live health probe for the running deployment.
 *
 * Every check reads through the same authenticated path a real request would use,
 * so a green result means the session, RPC grants, database and the cost guard are
 * all working on this deployment — not merely that a process is listening. No
 * external provider is contacted; the model check reports configuration only.
 */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);

  const checks: Check[] = [];
  const run = async (id: string, work: () => Promise<{ status: Check['status']; detail: string }>) => {
    const started = Date.now();
    try {
      const result = await work();
      checks.push({ id, ...result, ms: Date.now() - started });
    } catch (error) {
      checks.push({ id, status: 'fail', detail: (error instanceof Error ? error.message : 'unavailable').slice(0, 120), ms: Date.now() - started });
    }
  };

  await run('database', async () => {
    const readiness = await contentReadiness();
    return { status: 'ok', detail: `published ${readiness.published}, verified ${readiness.verified}` };
  });
  await run('content-gate', async () => {
    const readiness = await contentReadiness();
    return readiness.verified > 0 && readiness.synthetic === 0
      ? { status: 'ok', detail: 'ready for review' }
      : { status: 'degraded', detail: `verified ${readiness.verified}, synthetic ${readiness.synthetic}` };
  });
  await run('cost-guard', async () => {
    const budget = await usage();
    return budget.used >= budget.limit
      ? { status: 'degraded', detail: `turn budget exhausted (${budget.used}/${budget.limit})` }
      : { status: 'ok', detail: `${budget.used}/${budget.limit} turns this hour` };
  });
  await run('model', async () => {
    const configured = Boolean(process.env.KINNSO_MODEL_BASE_URL && process.env.KINNSO_MODEL_API_KEY && process.env.KINNSO_MODEL_ID);
    return configured
      ? { status: 'ok', detail: `configured: ${process.env.KINNSO_MODEL_ID}` }
      : { status: 'degraded', detail: 'no model key; replies are tool-grounded only' };
  });
  await run('booking-queue', async () => {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_booking_health');
    if (response.error) throw new Error(response.error.message);
    const data = (response.data ?? {}) as { pending?: number; stalePending?: number; oldestPendingHours?: number; acceptedLast7d?: number; declinedLast7d?: number; blockedRanges?: number; staleCreators?: Array<{ creatorName?: string; pending?: number; oldestPendingHours?: number }> };
    const pending = data.pending ?? 0;
    const stale = data.stalePending ?? 0;
    const detail = `pending ${pending} (oldest ${data.oldestPendingHours ?? 0}h) · accepted 7d ${data.acceptedLast7d ?? 0} · declined 7d ${data.declinedLast7d ?? 0} · blocked ranges ${data.blockedRanges ?? 0}`;
    const slowest = Array.isArray(data.staleCreators) ? data.staleCreators[0] : null;
    const slowestText = slowest ? ` (${slowest.creatorName ?? 'creator'}: ${slowest.pending ?? 0} pending, oldest ${slowest.oldestPendingHours ?? 0}h)` : '';
    return stale > 0
      ? { status: 'degraded', detail: `${detail}; ${stale} pending older than 72h${slowestText}` }
      : { status: 'ok', detail };
  });
  await run('email-outbox', async () => {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_public_health');
    if (response.error) throw new Error(response.error.message);
    const data = (response.data ?? {}) as { emailOutboxEnabled?: boolean; emailOutboxPending?: number; emailOutboxFailed?: number; emailOutboxOldestPendingHours?: number };
    const provider = process.env.KINNSO_EMAIL_PROVIDER ?? 'none';
    if (data.emailOutboxEnabled !== true) {
      return { status: 'ok', detail: `disabled (flag off, provider ${provider})` };
    }
    const pending = data.emailOutboxPending ?? 0;
    const failed = data.emailOutboxFailed ?? 0;
    const oldest = data.emailOutboxOldestPendingHours ?? 0;
    const detail = `provider ${provider} · pending ${pending} (oldest ${oldest}h) · failed ${failed}`;
    return failed > 0 || oldest >= 1
      ? { status: 'degraded', detail }
      : { status: 'ok', detail };
  });
  await run('deployment', async () => ({
    status: 'ok',
    detail: [
      process.env.VERCEL_GIT_COMMIT_SHA ? `commit ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)}` : null,
      process.env.VERCEL_URL ? `url ${process.env.VERCEL_URL}` : 'local runtime',
      process.env.VERCEL_ENV ?? process.env.KINNSO_ENVIRONMENT ?? 'unknown env',
    ].filter(Boolean).join(' · '),
  }));

  const worst = checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'degraded') ? 'degraded' : 'ok';
  return reply(
    {
      ok: true,
      data: {
        status: worst,
        checkedAt: new Date().toISOString(),
        checks,
      },
    },
    200,
  );
}
