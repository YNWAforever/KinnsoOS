import { apiContext, failure, reply } from '../../../../lib/api/server';
import { contentReadiness } from '../../../../lib/content-honesty/server';
import { usage } from '../../../../lib/chat/server';

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
