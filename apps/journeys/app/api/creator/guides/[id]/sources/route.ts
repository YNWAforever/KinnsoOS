import { apiContext, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';
import { parseSourcesInput } from '../../../../../../lib/content-honesty/contracts';
import { setGuideSources } from '../../../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

/** Creator-only replacement of one owned guide's source references.
 *
 * Same-origin write. The RPC re-checks the fresh active-creator role and
 * ownership, validates the exact [{title, url?}] shape (0..20 entries, https
 * URLs up to 500 characters) and replaces guides.source_refs atomically. An
 * identical repeat is an idempotent no-op. This endpoint never publishes or
 * changes visibility, even for a draft. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator', true);
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  let input: ReturnType<typeof parseSourcesInput>;
  try {
    input = parseSourcesInput(await boundedBody(request, 16384));
  } catch {
    return failure('INVALID', 400);
  }
  if (!input) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: await setGuideSources(id, input) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/creator_required|forbidden|not_authorized/.test(message)) return failure('FORBIDDEN', 403);
    if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
    if (/invalid_sources/.test(message)) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}
