import { apiContext, backendFailure, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { object, uuid } from '../../../../../../lib/api/validation';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 const ctx = await apiContext(request, 'creator', true); if (ctx.response) return ctx.response;
 const { id } = await context.params; if (!uuid(id)) return failure('INVALID', 400);
 try {
  const body = object(await boundedBody(request), ['expectedRevision', 'requestId']);
  if (!uuid(body.requestId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) return failure('INVALID', 400);
  const result = await ctx.client.rpc('publish_kinnso_guide_draft', { p_draft_id: id, p_expected_revision: body.expectedRevision, p_request_id: body.requestId });
  return result.error ? backendFailure(result.error) : reply({ ok: true, data: result.data });
 } catch { return failure('INVALID', 400); }
}
