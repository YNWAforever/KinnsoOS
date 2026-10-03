import { apiContext,backendFailure,boundedBody,failure,reply } from '../../../lib/api/server';
import { object,uuid } from '../../../lib/api/validation';
export async function GET(request: Request) {
  const ctx = await apiContext(request,'trips'); if (ctx.response) return ctx.response;
  const after = new URL(request.url).searchParams.get('after');
  if (after && !uuid(after)) return failure('INVALID',400);
  let query = ctx.client.from('trips').select('id,title,timezone,start_date,status,head_revision_no').order('id').limit(21);
  if (after) query = query.gt('id',after);
  const result = await query;
  if (result.error) return backendFailure(result.error);
  return reply({ok:true,data:{items:result.data.slice(0,20).map(row => ({id:row.id,title:row.title,timezone:row.timezone,startDate:row.start_date,status:row.status,revision:row.head_revision_no})),nextCursor:result.data.length > 20 ? result.data[19].id : null}});
}
export async function POST(request: Request) {
  const ctx = await apiContext(request,'trips',true); if (ctx.response) return ctx.response;
  try {
    const body = object(await boundedBody(request),['requestId','input']);
    if (!uuid(body.requestId)) return failure('INVALID',400);
    const input = object(body.input,['title','timezone','startDate','destinationId']);
    const result = await ctx.client.rpc('create_trip_v2',{p_request_id:body.requestId,p_payload:input});
    return result.error ? backendFailure(result.error) : reply({ok:true,data:result.data},201);
  } catch { return failure('INVALID',400); }
}
