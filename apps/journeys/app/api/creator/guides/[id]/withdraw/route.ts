import { apiContext, backendFailure, failure, reply } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 const ctx = await apiContext(request, 'creator', true); if (ctx.response) return ctx.response;
 const { id } = await context.params; if (!uuid(id)) return failure('INVALID', 400);
 // The existing service owns source revocation and traveller aggregate revisions.
 const result = await ctx.client.rpc('withdraw_guide_versions', { p_guide_id: id });
 return result.error ? backendFailure(result.error) : reply({ ok: true, data: result.data });
}
