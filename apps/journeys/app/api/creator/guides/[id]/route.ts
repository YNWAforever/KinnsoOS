import { apiContext, backendFailure, boundedBody, failure, reply } from '../../../../../lib/api/server';
import { object, uuid } from '../../../../../lib/api/validation';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
 const ctx = await apiContext(request, 'creator'); if (ctx.response) return ctx.response;
 const { id } = await context.params; if (!uuid(id)) return failure('INVALID', 400);
 const result = await ctx.client.rpc('get_kinnso_guide_draft', { p_draft_id: id });
 return result.error ? backendFailure(result.error) : reply({ ok: true, data: result.data });
}
export async function PUT(request: Request, context: Context) {
 const ctx = await apiContext(request, 'creator', true); if (ctx.response) return ctx.response;
 const { id } = await context.params; if (!uuid(id)) return failure('INVALID', 400);
 try {
  const body = object(await boundedBody(request), ['expectedRevision', 'requestId', 'payload']);
  if (!uuid(body.requestId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) return failure('INVALID', 400);
  const result = await ctx.client.rpc('save_kinnso_guide_draft', { p_draft_id: id, p_expected_revision: body.expectedRevision, p_request_id: body.requestId, p_payload: body.payload });
  return result.error ? backendFailure(result.error) : reply({ ok: true, data: result.data });
 } catch { return failure('INVALID', 400); }
}
