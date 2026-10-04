import type {BudgetStore} from '../budgets/service.ts';
import {units} from '../budgets/contracts.ts';
import {canonicalUrl} from '../agent/result-contract.ts';
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ScanPorts={
 /** Each call must independently check the live session and creator row. */
 authorize:()=>Promise<{actorId:string;creatorStatus:'onboarding'|'active';accessToken:string}|null>;
 ownedJob:(jobId:string,actorId:string)=>Promise<{id:string;status:string}|null>;
 budget:BudgetStore;
 transport:typeof fetch;
};
export function scanTarget(env:Record<string,string|undefined>):string|null {
 if(env.KINNSO_SCAN_WORKER_AUTHORIZED!=='true')return null;
 const canonical=canonicalUrl(env.KINNSO_SCAN_WORKER_ORIGIN);if(!canonical)return null;
 const url=new URL(canonical);
 if(url.pathname!=='/'||url.search||url.hash||url.origin!==env.KINNSO_APPROVED_SCAN_WORKER_ORIGIN)return null;
 return url.origin;
}
/** The worker revalidates the actor token and owns durable job uniqueness/retry CAS. No browser token or provider keys are accepted. */
export async function requestScan(input:{jobId:string|null;requestId:string;estimate:number},env:Record<string,string|undefined>,ports:ScanPorts):Promise<{ok:true;jobId:string;accepted:true;reconciliationRequired:true}|{ok:false;reason:string}> {
 if(!id.test(input.requestId)||(input.jobId!==null&&!id.test(input.jobId))||!Number.isSafeInteger(input.estimate)||input.estimate<1)throw new Error('INVALID');
 units(input.estimate);
 const origin=scanTarget(env);if(!origin)return{ok:false,reason:'unconfigured'};
 if(typeof ports.budget.settle!=='function')return{ok:false,reason:'reconciliation_unconfigured'};
 const actor=await ports.authorize();
 if(!actor||!id.test(actor.actorId)||!['onboarding','active'].includes(actor.creatorStatus)||!actor.accessToken)return{ok:false,reason:'forbidden'};
 if(input.jobId){const job=await ports.ownedJob(input.jobId,actor.actorId);if(!job||job.id!==input.jobId)return{ok:false,reason:'not_found'};if(job.status!=='failed')return{ok:false,reason:'conflict'};}
 const reservation=await ports.budget.reserve({service:'ai',requestId:input.requestId,estimate:input.estimate});
 if(!reservation.allowed)return{ok:false,reason:reservation.reason};
 // A 202 response means work was accepted, not completed. Hold the reservation for trusted cost reconciliation.
 try{
  const response=await ports.transport(origin+(input.jobId?`/scan/${input.jobId}/retry`:'/scan'),{method:'POST',headers:{Authorization:'Bearer '+actor.accessToken,'Content-Type':'application/json'},body:'{}',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(response.status!==202)return{ok:false,reason:response.status===429?'rate_limited':'reconciliation_required'};
  const value:unknown=await response.json();
  if(!value||typeof value!=='object'||!('jobId'in value)||typeof value.jobId!=='string'||!id.test(value.jobId)||(input.jobId&&value.jobId!==input.jobId))return{ok:false,reason:'reconciliation_required'};
  // Verify the worker-returned ID against fresh owned backend data; never trust a transport's claimed actor.
  const job=await ports.ownedJob(value.jobId,actor.actorId);
  if(!job||job.id!==value.jobId)return{ok:false,reason:'reconciliation_required'};
  return{ok:true,jobId:job.id,accepted:true,reconciliationRequired:true};
 }catch{return{ok:false,reason:'reconciliation_required'};}
}
