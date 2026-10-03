import { apiContext,backendFailure,boundedBody,failure,reply } from '../../../../lib/api/server';
import { object,uuid } from '../../../../lib/api/validation';
type Context = { params: Promise<{id:string}> };
export async function GET(request: Request, context: Context) {
  const ctx = await apiContext(request,'trips'); if (ctx.response) return ctx.response;
  const {id} = await context.params; if (!uuid(id)) return failure('NOT_FOUND',404);
  const result = await ctx.client.rpc('get_trip_snapshot',{p_trip_id:id});
  return result.error ? backendFailure(result.error) : reply({ok:true,data:result.data});
}
export async function DELETE(request: Request, context: Context) {
  const ctx = await apiContext(request,'trips',true); if (ctx.response) return ctx.response;
  const {id} = await context.params; if (!uuid(id)) return failure('NOT_FOUND',404);
  try {
    const body = object(await boundedBody(request),['requestId','expectedRevision']);
    if (!uuid(body.requestId) || !Number.isSafeInteger(body.expectedRevision)) return failure('INVALID',400);
    const result = await ctx.client.rpc('delete_trip_v2',{p_trip_id:id,p_expected_revision:body.expectedRevision,p_request_id:body.requestId});
    return result.error ? backendFailure(result.error) : reply({ok:true,data:result.data});
  } catch { return failure('INVALID',400); }
}
