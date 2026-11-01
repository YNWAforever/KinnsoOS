import type {DiscoveryIntent,DiscoveryStore,DiscoveryReceipt,DiscoveryError} from './contracts.ts';
import {commandDigest,stableJson,parseDiscoveryIntent} from './policy.ts';
export type DiscoveryVerifiedOutcome={status:'complete'|'deleted';receipt:DiscoveryReceipt}|{status:'unknown'|'restricted'|'conflict';code?:DiscoveryError};
export async function verifyDiscoveryCommand(store:DiscoveryStore,raw:DiscoveryIntent):Promise<DiscoveryVerifiedOutcome>{
 let intent:DiscoveryIntent;
 try{intent=parseDiscoveryIntent(raw);}catch{return {status:'restricted',code:'INVALID'};}
 try{await store.stage(intent);}catch(e){
  const code=e instanceof Error?e.message:'';
  if(code==='CONFLICT')return {status:'conflict',code:'CONFLICT'};
  if(['AUTH_REQUIRED','FORBIDDEN','RESTRICTED','INVALID','NOT_FOUND'].includes(code))return {status:'restricted',code:code as DiscoveryError};
  return {status:'unknown'};
 }
 let expected:DiscoveryReceipt|undefined;
 try{
  const result=await store.command(intent);
  if(result.ok)expected=result.receipt;
  else if(result.code==='CONFLICT')return {status:'conflict',code:result.code};
  else if(!['UNAVAILABLE','TIMEOUT'].includes(result.code))return {status:'restricted',code:result.code};
 }catch{/* A lost acknowledgement may follow a successful write. Read the same UUID. */}
 try{
  const first=await store.receipt(intent.requestId),second=await store.receipt(intent.requestId);
  if(first.status==='restricted'||second.status==='restricted')return {status:'restricted'};
  if(first.status!=='complete'||second.status!=='complete'||stableJson(first)!==stableJson(second))return {status:'unknown'};
  const r=first.receipt;if(r.requestId!==intent.requestId||r.resourceId!==intent.targetId||r.commandDigest!==await commandDigest(intent)||expected&&stableJson(r)!==stableJson(expected))return {status:'unknown'};
  await store.clear(intent.requestId);return {status:first.resourceState==='deleted'?'deleted':'complete',receipt:r};
 }catch{return {status:'unknown'};}
}
/** Generation fence used on actor/company/intent navigation, including rejected requests. */
export function createScopeFence(){let generation=0;return {next:()=>++generation,current:(g:number)=>g===generation,invalidate:()=>{generation++;}};}
