import { apiContext, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';
import { parseAttestInput } from '../../../../../../lib/content-honesty/contracts';
import { attestGuideVersion } from '../../../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

/** Creator-only rights attestation for one current guide version.
 *
 * Same-origin write. The RPC re-checks the fresh active-creator role and guide
 * ownership, refuses synthetic guides and stale versions, and never publishes
 * or changes visibility. Validation errors are 400, a non-owner/non-creator is
 * 403 (guide_not_found only for their own other guide), a conflicting receipt
 * is 409, and a new receipt is 201. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator', true);
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  let input: ReturnType<typeof parseAttestInput>;
  try {
    input = parseAttestInput(await boundedBody(request, 16384));
  } catch {
    return failure('INVALID', 400);
  }
  if (!input) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: await attestGuideVersion(id, input) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/attestation_conflict|version_conflict/.test(message)) return failure('CONFLICT', 409);
    if (/forbidden|creator_required|not_authorized/.test(message)) return failure('FORBIDDEN', 403);
    if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
    if (/invalid_attestation|synthetic_guide/.test(message)) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}
