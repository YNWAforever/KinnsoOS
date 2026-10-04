import {parseEvent,uuid} from './events.ts';
import {parseSample} from './performance.ts';
import type {ScheduledRun} from './alerts.ts';
import type {Budget} from '../budgets/contracts.ts';
export type RpcClient={rpc:(name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
export async function rpc<T>(client:RpcClient,name:string,args:Record<string,unknown>={}):Promise<T> {
 const result=await client.rpc(name,args);if(result.error)throw new Error('MONITORING_UNAVAILABLE');return result.data as T;
}
export type Monitoring={day:string;funnel:{name:string;count:number|null;status:'unknown'|'measured'}[];performance:{metric:string;count:number;status:'unknown'|'insufficient'|'measured';p75:number|null}[];budgets:(Omit<Budget,'limit'|'spent'|'reserved'|'stopBehavior'>&{limit:number|null;spent:number|null;reserved:number|null;stopBehavior:'stop'|'degrade'|null;unit:string|null;status:'disabled'|'available'|'exhausted'|'overrun';successfulFlows:number|null;costPerSuccessfulFlow:number|null;owner:string;runbook:string})[];scheduledRuns:ScheduledRun[]};
/** Service client is server-only. Caller determines environment/context and proves successful mutations. */
export async function recordEvent(service:RpcClient,actorId:string|null,value:unknown) {
 const event=parseEvent(value);if(!event)return{accepted:false};
 if(actorId!==null&&!uuid.test(actorId))throw new Error('INVALID_ACTOR');
 return rpc<{accepted:boolean;replayed?:boolean}>(service,'ingest_kinnso_telemetry',{p_actor_id:actorId,p_event:event,p_sample:null});
}
export async function recordPerformance(service:RpcClient,requestId:string,value:unknown,context:{mode:string;context:string;consent:string}) {
 const sample=parseSample(value);if(!sample||!uuid.test(requestId)||context.mode!=='connected'||!['traveller','creator','admin'].includes(context.context))return{accepted:false};
 if(['LCP','INP','CLS'].includes(sample.metric)&&(context.consent!=='accepted'||context.context==='admin'))return{accepted:false};
 return rpc<{accepted:boolean;replayed?:boolean}>(service,'record_kinnso_performance',{p_request_id:requestId,p_sample:sample,p_mode:context.mode,p_context:context.context,p_consent:context.consent});
}
export function monitoring(user:RpcClient,day?:string) {return rpc<Monitoring>(user,'get_kinnso_monitoring',day?{p_day:day}:{});}
/** Persist the original job result. A failure must not advance last successful run. */
export async function trackScheduled<T>(service:RpcClient,job:ScheduledRun['job'],work:()=>Promise<T>) {
 const started=new Date().toISOString();let result:T;
 try{result=await work();}
 catch(error){
  try{await rpc(service,'record_kinnso_scheduled_run',{p_job:job,p_successful:false,p_started_at:started});}catch{/* Preserve the original job failure. */}
  throw error;
 }
 try{await rpc(service,'record_kinnso_scheduled_run',{p_job:job,p_successful:true,p_started_at:started});}catch{/* An optional health sink cannot make a committed operation appear unsuccessful. */}
 return result;
}
