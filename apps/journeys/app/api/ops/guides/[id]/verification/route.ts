import { apiContext, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';
import { parseEvidenceInput } from '../../../../../../lib/content-honesty/contracts';
import { opsSetEvidence } from '../../../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

/** Ops-only evidence update for one guide: the synthetic classification and the
 * place-verification date, the two facts a creator cannot self-declare.
 *
 * Same-origin write. The RPC re-checks the fresh active-ops role, refuses a
 * non-ops caller and an unknown guide, and writes only those two guide columns
 * (status, rights, sources and visibility are untouched). A null
 * placeVerifiedAt or clearPlace:true clears the date; an absent key leaves it
 * alone. No effective field is an invalid body rather than a silent no-op. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  let input: ReturnType<typeof parseEvidenceInput>;
  try {
    input = parseEvidenceInput(await boundedBody(request, 4096));
  } catch {
    return failure('INVALID', 400);
  }
  if (!input) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: await opsSetEvidence(id, input) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/forbidden|not_authorized/.test(message)) return failure('FORBIDDEN', 403);
    if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
    if (/invalid_evidence/.test(message)) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}
