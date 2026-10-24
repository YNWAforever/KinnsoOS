import {successEvent,timedRpc} from '../../../lib/telemetry/server';
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
  let command:{requestId:string;input:Record<string,unknown>};
  try {
    const body = object(await boundedBody(request),['requestId','input']);
    if (!uuid(body.requestId)) return failure('INVALID',400);
    command={requestId:String(body.requestId),input:object(body.input,['title','timezone','startDate','destinationId'])};
  } catch { return failure('INVALID',400); }
  let result:Awaited<ReturnType<typeof timedRpc>>;
  try {
    result=await timedRpc(ctx.client,'create_trip_v2',{p_request_id:command.requestId,p_payload:command.input},ctx.actor);
  } catch {
    // A transport exception may follow a commit. Never call it validation failure.
    return failure('UNAVAILABLE',503);
  }
  if(result.error){
    const response=backendFailure(result.error),code=result.error.code??'';
    // Only an actual PostgreSQL statement rejection can be terminal INVALID.
    if(response.status===400&&code!=='P0001'&&code!=='23514'&&!code.startsWith('22'))return failure('UNAVAILABLE',503);
    return response;
  }
  try{await successEvent(ctx.actor,'trip_created',command.requestId)}catch{
    // Optional measurement cannot discard a known durable acknowledgement.
  }
  return reply({ok:true,data:result.data},201);
}
