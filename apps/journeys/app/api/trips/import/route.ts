import {successEvent,timedRpc} from '../../../../lib/telemetry/server';
import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
export async function POST(request:Request) {
 const ctx=await apiContext(request,'trips',true);if(ctx.response)return ctx.response;
 try{
  const body=object(await boundedBody(request),['requestId','sourceId','payload']);
  if(!uuid(body.requestId)||typeof body.sourceId!=='string')return failure('INVALID',400);
  const result=await timedRpc(ctx.client,'import_local_trip',{p_request_id:body.requestId,p_source_id:body.sourceId,p_payload:body.payload},ctx.actor);
    if(!result.error)await successEvent(ctx.actor,'trip_imported',body.requestId);
  return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure('INVALID',400)}
}
