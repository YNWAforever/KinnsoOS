import type {StudioCommand,StudioEnvelope,StudioReceipt,StudioResponse,StudioThread,GuideHandoff} from './contracts';
import {sameValue} from './contracts';
export type RequestReadback={status:'complete';receipt:StudioReceipt<unknown>}|{status:'unknown'|'restricted';requestId:string};
export async function studioRequest<T>(url:string,actorId:string,method='GET',body?:unknown):Promise<StudioResponse<T>>{
 try{
  const response=await fetch(url,{method,headers:{'X-Kinnso-Intent-Actor':actorId,...body?{'Content-Type':'application/json'}:{}},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const value=await response.json();
  if(typeof value?.ok!=='boolean'||!response.ok&&value.ok)throw Error('INVALID_RESPONSE');
  if(!value.ok&&!['AUTH_REQUIRED','FORBIDDEN','NOT_FOUND','CONFLICT','INVALID','UNAVAILABLE','RESTRICTED'].includes(value.code))throw Error('INVALID_RESPONSE');
  return value;
 }catch{return{ok:false,code:'UNAVAILABLE',retryable:true};}
}
export function studioRepository(actorId:string){return{
 getThread:(id:string)=>studioRequest<StudioThread>('/api/studio/threads/'+encodeURIComponent(id),actorId),
 listThreads:()=>studioRequest<{items:Pick<StudioThread,'id'|'title'|'revision'|'templateId'>[]}>('/api/studio/threads',actorId),
 getRequest:(id:string)=>studioRequest<RequestReadback>('/api/studio/requests/'+encodeURIComponent(id),actorId),
 command:<T>(intent:StudioEnvelope<StudioCommand>)=>studioRequest<StudioReceipt<T>>('/api/studio/commands',actorId,'POST',intent),
 guideContext:(id:string)=>studioRequest<{artifactId:string;artifactRevision:number;selectedBlockIds:string[];threadId:string}>('/api/studio/guides/'+encodeURIComponent(id),actorId),
};}
export async function verifiedCommand<T>(actorId:string,intent:StudioEnvelope<StudioCommand>):Promise<StudioResponse<StudioReceipt<T>>>{
 const repo=studioRepository(actorId),ack=await repo.command<T>(intent);if(!ack.ok)return ack;
 const read=await repo.getRequest(intent.requestId);
 if(!read.ok)return read;
 if(read.data.status==='restricted')return{ok:false,code:'RESTRICTED',retryable:false};
 if(read.data.status!=='complete'||ack.data.requestId!==intent.requestId||!sameValue(read.data.receipt,ack.data))return{ok:false,code:'UNAVAILABLE',retryable:true};
 return ack;
}
export const handoffFromReceipt=(r:StudioReceipt<GuideHandoff>)=>r.data;
