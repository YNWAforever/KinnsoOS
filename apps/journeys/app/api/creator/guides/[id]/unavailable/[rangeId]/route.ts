import { apiContext, failure, reply } from '../../../../../../../lib/api/server';
import { uuid } from '../../../../../../../lib/api/validation';

export const dynamic = 'force-dynamic';

/** Remove one of the creator's own blocked ranges. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string; rangeId: string }> }) {
  const ctx = await apiContext(request, 'creator', true);
  if (ctx.response) return ctx.response;
  const { rangeId } = await context.params;
  if (!uuid(rangeId)) return failure('INVALID', 400);
  try {
    const response = await ctx.client.rpc('kinnso_creator_remove_unavailable', { p_id: rangeId });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/range_not_found/.test(message)) return failure('NOT_FOUND', 404);
    if (/actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
