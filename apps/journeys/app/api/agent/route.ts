import {apiContext,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
import {TASKS,allowedTools} from '../../../lib/agent/policy';
import type {AgentTask} from '../../../lib/agent/policy';
import {readContext,sourceOrigin} from '../../../lib/agent/tools';
import {executeAgent} from '../../../lib/agent/service';
export const maxDuration=30;
export async function POST(request:Request) {
 const ctx=await apiContext(request,'agent',true);if(ctx.response)return ctx.response;
 try{
  const body=object(await boundedBody(request,65536),['task','prompt','tripId','merchantId','locale','requestId']);
  if(!TASKS.includes(body.task as AgentTask)||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>50000||!uuid(body.requestId)||!['en','zh-hk','zh-cn'].includes(String(body.locale))||(body.tripId!==undefined&&!uuid(body.tripId))||(body.merchantId!==undefined&&!uuid(body.merchantId)))return failure('INVALID',400);
  const input={task:body.task as AgentTask,prompt:body.prompt,tripId:body.tripId as string|undefined,merchantId:body.merchantId as string|undefined,locale:body.locale as 'en'|'zh-hk'|'zh-cn',requestId:body.requestId};
  allowedTools(ctx.actor,input.task);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const context=await Promise.race([
   readContext(ctx.client,ctx.actor,input,sourceOrigin(process.env.KINNSO_CANONICAL_SOURCE_ORIGIN)),
   new Promise<{sources:[];trip:null;readFailure:string}>(resolve=>{timer=setTimeout(()=>resolve({sources:[],trip:null,readFailure:'timeout'}),10000);}),
  ]).finally(()=>{if(timer)clearTimeout(timer);});
  // Paid generation needs a separately approved transport, actual-cost conversion and durable budget settlement. No implicit credentials/defaults.
  const data=await executeAgent({...input,...context,actor:ctx.actor});
  return reply({ok:true,data});
 }catch(error){
  const message=error instanceof Error?error.message:'';
  if(message==='FORBIDDEN')return failure('FORBIDDEN',403);
  if(message==='INVALID')return failure('INVALID',400);
  if(message==='RATE_LIMIT')return reply({ok:false,code:'UNAVAILABLE',reason:'rate_limited',retryable:true,requestId:crypto.randomUUID()},429);
  return failure('UNAVAILABLE',503);
 }
}
