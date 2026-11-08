import { apiContext, failure, reply } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';
import { creatorGuideHonesty } from '../../../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

/** Creator-only read of one owned guide's honesty projection.
 *
 * Drafts are readable by their owner (unlike the public read, which only sees
 * published guides). The RPC re-checks the fresh active-creator role and guide
 * ownership, so a non-owner, a revoked creator and a missing guide are all
 * indistinguishable from the outside: creator_required is 403 and
 * guide_not_found is 404. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator');
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  try {
    return reply({ ok: true, data: await creatorGuideHonesty(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/creator_required|forbidden|not_authorized/.test(message)) return failure('FORBIDDEN', 403);
    if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
    return failure('UNAVAILABLE', 503);
  }
}
