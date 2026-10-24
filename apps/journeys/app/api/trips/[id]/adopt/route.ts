import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
import {pilotEvent} from '../../../../../lib/telemetry/pilot-server';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const ctx=await apiContext(request,'trips',true);if(ctx.response)return ctx.response;
 const {id}=await params;if(!uuid(id))return failure('NOT_FOUND',404);
 let body:Record<string,unknown>;
 try{
  body=object(await boundedBody(request),['guideId','version','expectedRevision','requestId','flowId']);
  if(!uuid(body.guideId)||!uuid(body.requestId)||(body.flowId!==undefined&&!uuid(body.flowId))||!Number.isSafeInteger(body.version)||!Number.isSafeInteger(body.expectedRevision))return failure('INVALID',400);
 }catch{return failure('INVALID',400)}
 const measurement=body.flowId?{flowId:body.flowId as string,guideId:body.guideId as string,tripId:id,requestId:body.requestId as string}:null;
 if(measurement)try{await pilotEvent(ctx.actor,{phase:'confirmed',...measurement})}catch{/* Optional measurement cannot block a traveller action. */}
 let result:Awaited<ReturnType<typeof ctx.client.rpc>>;
 try{
  result=await ctx.client.rpc('adopt_guide_to_trip',{p_guide_id:body.guideId,p_version:body.version,p_trip_id:id,p_expected_revision:body.expectedRevision,p_request_id:body.requestId});
 }catch{return failure('UNAVAILABLE',503)}
 if(result.error){
  const response=backendFailure(result.error),code=result.error.code??'';
  if(response.status===400&&code!=='P0001'&&code!=='23514'&&!code.startsWith('22'))return failure('UNAVAILABLE',503);
  return response;
 }
 if(measurement)try{await pilotEvent(ctx.actor,{phase:'adopted',...measurement,revision:result.data.revision})}catch{/* Keep the known durable acknowledgement. */}
 return reply({ok:true,data:result.data});
}
