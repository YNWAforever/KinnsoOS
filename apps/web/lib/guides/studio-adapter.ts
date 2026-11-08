import type {DraftPayload,GuideDraft} from '@kinnso/journeys/lib/creators/contracts'
import type {GuideHandoff} from '@kinnso/journeys/lib/studio/contracts'
import {sameValue} from '@kinnso/journeys/lib/studio/contracts'
import {parseStudioCommand,studioUuid} from '@kinnso/journeys/lib/studio/policy'
import {verifyGuidePublication} from '@kinnso/journeys/lib/studio/guide-publication'
type RpcClient={rpc:(name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>}
export type BoundGuideIntent={actorId:string;guideId:string;action:'save'|'publish';requestId:string;preparationId:string;expectedRevision:number;payload:DraftPayload;confirmed:true}
export type BoundResult={ok:true;draft:GuideDraft;published:boolean}|{ok:false;code:'AUTH_REQUIRED'|'FORBIDDEN'|'CONFLICT'|'INVALID'|'UNKNOWN';retryable:boolean}
function classify(message:string):BoundResult{return{ok:false,code:/unauthenticated/.test(message)?'AUTH_REQUIRED':/studio_restricted|source_stale|creator_required|forbidden|studio_confirmation_required/.test(message)?'FORBIDDEN':/conflict/.test(message)?'CONFLICT':/invalid_/.test(message)?'INVALID':'UNKNOWN',retryable:!(/unauthenticated|restricted|source_stale|creator_required|forbidden|confirmation_required|conflict|invalid_/.test(message))}}
/** Uses only this web app's independently authenticated client. */
export async function executeBoundGuide(client:RpcClient,actor:string,intent:BoundGuideIntent):Promise<BoundResult>{
 if(intent.actorId!==actor)return{ok:false,code:'AUTH_REQUIRED',retryable:false}
 if(!studioUuid(intent.guideId)||!studioUuid(intent.requestId)||!studioUuid(intent.preparationId)||intent.confirmed!==true||!['save','publish'].includes(intent.action)||!Number.isSafeInteger(intent.expectedRevision)||intent.expectedRevision<1||JSON.stringify(intent).length>131072)return{ok:false,code:'INVALID',retryable:false}
 try{
  let handoff:GuideHandoff
  const prior=await client.rpc('get_kinnso_studio_request',{p_request_id:intent.preparationId})
  if(prior.error)return classify(prior.error.message??'')
  const recovered=prior.data as {status:string;receipt?:{data:GuideHandoff}}
  if(recovered.status==='restricted')return{ok:false,code:'FORBIDDEN',retryable:false}
  if(recovered.status==='complete'&&recovered.receipt){handoff=recovered.receipt.data}
  else{
   const context=await client.rpc('get_kinnso_studio_guide_context',{p_guide_id:intent.guideId})
   if(context.error)return classify(context.error.message??'')
   const c=context.data as {artifactId:string;artifactRevision:number;selectedBlockIds:string[]}
   const command=parseStudioCommand({requestId:intent.preparationId,expectedRevision:0,payload:{targetId:intent.preparationId,kind:intent.action==='save'?'prepareGuideSave':'prepareGuidePublish',data:{guideId:intent.guideId,expectedGuideRevision:intent.expectedRevision,domainRequestId:intent.requestId,confirmed:true,...intent.action==='save'?{artifactId:c.artifactId,artifactRevision:c.artifactRevision,selectedBlockIds:c.selectedBlockIds,editedPayload:intent.payload}:{}}}})
   const prepared=await client.rpc('apply_kinnso_studio_command',{p_target_id:intent.preparationId,p_expected_revision:0,p_request_id:intent.preparationId,p_command:{kind:command.payload.kind,...command.payload.data}})
   if(prepared.error)return classify(prepared.error.message??'')
   const read=await client.rpc('get_kinnso_studio_request',{p_request_id:intent.preparationId})
   const outcome=read.data as {status:string;receipt:unknown}|null
   if(read.error||outcome?.status!=='complete'||!sameValue(outcome.receipt,prepared.data))return{ok:false,code:'UNKNOWN',retryable:true}
   handoff=(prepared.data as {data:GuideHandoff}).data
  }
  if(handoff.guideId!==intent.guideId||handoff.domainRequestId!==intent.requestId||handoff.operation!==intent.action||handoff.expectedRevision!==intent.expectedRevision||!sameValue(handoff.payload,intent.payload))return{ok:false,code:'CONFLICT',retryable:false}
  const ack=await client.rpc(intent.action==='save'?'save_kinnso_guide_draft':'publish_kinnso_guide_draft',{p_draft_id:intent.guideId,p_expected_revision:intent.expectedRevision,p_request_id:intent.requestId,...intent.action==='save'?{p_payload:intent.payload}:{}})
  if(ack.error)return classify(ack.error.message??'')
  const read=await client.rpc('get_kinnso_guide_draft',{p_draft_id:intent.guideId})
  if(read.error)return classify(read.error.message??'')
  const draft=read.data as GuideDraft
  if(intent.action==='publish'){
   const published=await client.rpc('kinnso_guide',{p_guide_id:intent.guideId})
   if(published.error||verifyGuidePublication(ack.data as Parameters<typeof verifyGuidePublication>[0],draft,published.data)!=='verified')return{ok:false,code:'UNKNOWN',retryable:true}
  }else{const saved=ack.data as GuideDraft;if(saved.id!==draft.id||saved.revision!==draft.revision||!sameValue(saved.payload,intent.payload)||!sameValue(draft.payload,intent.payload))return{ok:false,code:'UNKNOWN',retryable:true}}
  return{ok:true,draft,published:intent.action==='publish'}
 }catch{return{ok:false,code:'UNKNOWN',retryable:true}}
}
