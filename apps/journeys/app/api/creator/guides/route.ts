import { apiContext, backendFailure, failure, reply } from '../../../../lib/api/server';
import { uuid } from '../../../../lib/api/validation';
export async function GET(request: Request) {
 const ctx = await apiContext(request, 'creator'); if (ctx.response) return ctx.response;
 const after = new URL(request.url).searchParams.get('after'); if (after && !uuid(after)) return failure('INVALID', 400);
 const result = await ctx.client.rpc('list_kinnso_guide_drafts', { p_after: after });
 return result.error ? backendFailure(result.error) : reply({ ok: true, data: result.data });
}
