import {apiContext,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
export async function POST(request:Request) {
 const ctx=await apiContext(request,'creator',true);if(ctx.response)return ctx.response;
 try{
  // Existing creator UI posts jobId only. Its ordinary editor remains available when this paid transport is gated.
  const body=object(await boundedBody(request,8192),['jobId','requestId']);
  if((body.jobId!==null&&body.jobId!==undefined&&!uuid(body.jobId))||(body.requestId!==undefined&&!uuid(body.requestId)))return failure('INVALID',400);
  const creator=await ctx.client.from('creators').select('status').eq('id',ctx.actor.id).maybeSingle();
  if(creator.error)return failure('UNAVAILABLE',503);
  if(!creator.data||!['onboarding','active'].includes(creator.data.status))return failure('FORBIDDEN',403);
  if(body.jobId){
   const job=await ctx.client.from('creator_scan_jobs').select('id,status').eq('id',body.jobId).eq('creator_id',ctx.actor.id).maybeSingle();
   if(job.error)return failure('UNAVAILABLE',503);
   if(!job.data)return failure('NOT_FOUND',404);
   if(job.data.status!=='failed')return failure('CONFLICT',409);
  }
  // Missing approved worker pricing/actual-cost callback cannot reserve conservatively or settle. Do not dispatch paid work.
  return reply({ok:false,code:'UNAVAILABLE',reason:'scan_budget_transport_unconfigured',retryable:false,requestId:crypto.randomUUID()},503);
 }catch{return failure('INVALID',400);}
}
