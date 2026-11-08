import { apiContext, backendFailure, failure, reply } from '../../../../lib/api/server';
import { contentReadiness } from '../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

/** Ops-only published-corpus readiness counts. The fresh actor roles are
 * checked here for an explicit 403 and the RPC repeats the is_active_ops()
 * gate at the database boundary. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  try {
    return reply({ ok: true, data: await contentReadiness() });
  } catch (error) {
    return backendFailure({ message: error instanceof Error ? error.message : '' });
  }
}
