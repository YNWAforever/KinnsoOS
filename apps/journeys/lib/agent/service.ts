import {AGENT_MODEL,allowedTools} from './policy.ts';
import type {Actor,AgentTask} from './policy.ts';
import {evidence,unsafeText} from './result-contract.ts';
import type {AgentResult,Evidence,TripProposal} from './result-contract.ts';
import {validRateVersion,type MonthlyBudgetStore} from '../budgets/monthly.ts';
import {runBudgeted} from '../budgets/service.ts';
import type {TripSnapshot} from '../contracts/trips.ts';
/** A verified source older than 90 days is never presented as current. Publication is not verification. */
export const STALE_AFTER_MS=90*86400000;
export function groundedResult(input:{task:AgentTask;sources:Evidence[];readFailure?:string;now?:number;trip?:TripSnapshot|null;ownedContext?:string}):AgentResult {
 const records=input.sources.slice(0,15).map(evidence).filter((s):s is Evidence=>s!==null);
 const unsafe=records.some(s=>unsafeText(s.excerpt)||unsafeText(s.title))||unsafeText(input.ownedContext??'');
 const now=input.now??Date.now();
 const conflicting=records.some((s,index)=>records.slice(0,index).some(t=>t.url===s.url&&t.excerpt!==s.excerpt));
 const stale=records.some(s=>s.state==='stale'||(s.verifiedAt!==null&&now-Date.parse(s.verifiedAt)>STALE_AFTER_MS));
 const state=input.readFailure?'unavailable':unsafe?'unsafe_content':conflicting||records.some(s=>s.state==='conflicting')?'conflict':stale?'stale':!records.length?'no_data':records.some(s=>s.verifiedAt===null||s.state==='unknown'||Date.parse(s.verifiedAt)>now)?'unverified':'grounded';
 const reasons={unavailable:'Sources could not be loaded. Try again or continue in the ordinary editor.',unsafe_content:'A source contains unsafe instructions; I cannot use it for a recommendation.',conflict:'Sources conflict. I cannot determine which claim is correct.',stale:'Sources are marked out of date. I cannot confirm current details.',no_data:'I do not have enough source data to answer this request.',unverified:'Source excerpts below have no current verification date. Confirm details with the source before relying on them.',grounded:'Source excerpts below support this preview.'};
 const usable=state==='grounded'||state==='unverified';
 const sources=unsafe?[]:records.map(({url,title,verifiedAt})=>({url,title,verifiedAt}));
 const proposals:TripProposal[]=[];
 // A finite proposal only reorders two existing owned stops; it invents no place or factual content.
 if(usable&&input.task==='tripSuggestion'&&input.trip){
  const day=input.trip.days.find(d=>d.stops.length>=2);
  if(day)proposals.push({type:'tripCommand',requiresConfirmation:true,payload:{tripId:input.trip.id,expectedRevision:input.trip.revision,command:{type:'moveStop',id:day.stops[1].id,dayId:day.id,position:0}}});
 }
 return {answer:reasons[state]+(usable?'\n\n'+records.map(s=>`${s.title}\n${s.excerpt}`).join('\n\n')+(input.ownedContext?'\n\nOwned private context (not a public citation):\n'+input.ownedContext:''):''),sources,proposedActions:proposals,capabilityMode:'sources_only',providerStatus:'unconfigured',evidenceState:state};
}
export type ProviderPort={authorized:true;estimate:number;costUnit:'USD_micro';rateVersion:string;generate:(input:{model:string;task:AgentTask;prompt:string;sources:Evidence[];signal:AbortSignal})=>Promise<{value:AgentResult;actual:number;successful:boolean}>};
function acceptedProviderResult(value:unknown,fallback:AgentResult):boolean {
 if(!value||typeof value!=='object')return false;
 const candidate=value as Partial<AgentResult>;
 // Untrusted output must pass the application contract before earning successful-flow credit.
 return typeof candidate.answer==='string'&&!unsafeText(candidate.answer)&&candidate.answer===fallback.answer&&
  Array.isArray(candidate.sources)&&Array.isArray(candidate.proposedActions)&&candidate.proposedActions.length===0&&
  candidate.sources.every(source=>source!==null&&typeof source==='object'&&fallback.sources.some(known=>known.url===source.url&&known.title===source.title&&known.verifiedAt===source.verifiedAt));
}
/** Only trusted server code can supply this paid transport and unit conversion. No provider is configured by default. */
export async function executeAgent(input:{actor:Actor;task:AgentTask;prompt:string;sources:Evidence[];requestId:string;trip?:TripSnapshot|null;readFailure?:string;ownedContext?:string},paid?:{provider:ProviderPort;store:MonthlyBudgetStore},deadlineMs=20000):Promise<AgentResult> {
 allowedTools(input.actor,input.task);
 const fallback=groundedResult(input);
 if(!paid||paid.provider.authorized!==true)return fallback;
 if(paid.store.accounting!=='USD_calendar_month'||paid.provider.costUnit!=='USD_micro'||!validRateVersion(paid.provider.rateVersion)||paid.provider.rateVersion!==paid.store.rateVersion)return {...fallback,providerStatus:'budget_disabled'};
 if(!['grounded','unverified'].includes(fallback.evidenceState))return fallback;
 const controller=new AbortController();
 let timedOut=false;let timer:ReturnType<typeof setTimeout>|undefined;
 const result=await runBudgeted(paid.store,{service:'ai',requestId:input.requestId,estimate:paid.provider.estimate},async()=>{
  const outcome=await new Promise<{value:AgentResult;actual:number;successful:boolean}>((resolve,reject)=>{
   timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error('TIMEOUT'));},Math.max(1,Math.min(deadlineMs,20000)));
   paid.provider.generate({model:AGENT_MODEL,task:input.task,prompt:input.prompt,sources:input.sources,signal:controller.signal}).then(resolve,reject);
  });
  if(typeof outcome.successful!=='boolean')throw new Error('INVALID_OUTCOME');
  return {...outcome,successful:outcome.successful&&acceptedProviderResult(outcome.value,fallback)};
 }).finally(()=>{if(timer)clearTimeout(timer);});
 if(!result.ok)return{...fallback,providerStatus:timedOut?'timeout':result.reason==='disabled'?'budget_disabled':result.reason==='exhausted'?'budget_exhausted':'unavailable'};
 return{...fallback,capabilityMode:'connected',providerStatus:'available'};
}
