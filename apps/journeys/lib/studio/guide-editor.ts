import type {DraftPayload,GuideDraft} from '../creators/contracts';
import type {GuideSnapshot} from '../contracts/trips';
import type {GuideHandoff,StudioCommand,StudioEnvelope,StudioResponse} from './contracts';
import {sameValue} from './contracts';
import {studioRepository,studioRequest,verifiedCommand} from './repository';
import {verifyGuidePublication} from './guide-publication';
export type StudioGuideIntent={action:'save'|'publish'|'withdraw';requestId:string;preparationId:string;revision:number;payload:DraftPayload;preparation?:StudioEnvelope<StudioCommand>};
const key=(actor:string,guide:string)=>'kinnso.studio.guide.pending.'+actor+'.'+guide;
function remember(actor:string,guide:string,requestId:string){try{sessionStorage.setItem(key(actor,guide),requestId);}catch{}}
function forget(actor:string,guide:string){try{sessionStorage.removeItem(key(actor,guide));}catch{}}
export function verifyStudioDraftSave(ack:Pick<GuideDraft,'id'|'revision'|'payload'>,read:Pick<GuideDraft,'id'|'revision'|'payload'>,payload:DraftPayload){return ack.id===read.id&&ack.revision===read.revision&&sameValue(ack.payload,payload)&&sameValue(read.payload,payload);}
async function writeAndRead(actor:string,guide:string,handoff:GuideHandoff):Promise<StudioResponse<GuideDraft|{draft:GuideDraft;snapshot:GuideSnapshot}>>{
 const publish=handoff.operation==='publish';
 const ack=await studioRequest<GuideDraft|{draft:GuideDraft;snapshot:GuideSnapshot}>('/api/creator/guides/'+guide+(publish?'/publish':''),actor,publish?'POST':'PUT',{
  expectedRevision:handoff.expectedRevision,requestId:handoff.domainRequestId,...publish?{}:{payload:handoff.payload}});
 if(!ack.ok)return ack;
 const read=await studioRequest<GuideDraft>('/api/creator/guides/'+guide,actor);
 if(!read.ok)return read;
 if(publish){const publicRead=await studioRequest<GuideSnapshot>('/api/guides/'+guide,actor);
  if(!publicRead.ok)return publicRead;
  if(verifyGuidePublication(ack.data as {draft:GuideDraft;snapshot:GuideSnapshot},read.data,publicRead.data)!=='verified')return{ok:false,code:'UNAVAILABLE',retryable:true};
 }else if(!verifyStudioDraftSave(ack.data as GuideDraft,read.data,handoff.payload))return{ok:false,code:'UNAVAILABLE',retryable:true};
 forget(actor,guide);return ack;
}
export async function runStudioGuideAction(actor:string,guide:string,command:StudioGuideIntent):Promise<StudioResponse<GuideDraft|{draft:GuideDraft;snapshot:GuideSnapshot}>>{
 if(command.action==='withdraw')return{ok:false,code:'INVALID',retryable:false};
 if(!command.preparation){
  let context;
  if(command.action==='save'){const response=await studioRepository(actor).guideContext(guide);if(!response.ok)return response;context=response.data;}
  command.preparation=structuredClone({requestId:command.preparationId,expectedRevision:0,payload:{targetId:command.preparationId,kind:command.action==='save'?'prepareGuideSave':'prepareGuidePublish',data:{
   guideId:guide,expectedGuideRevision:command.revision,domainRequestId:command.requestId,confirmed:true,
   ...context?{artifactId:context.artifactId,artifactRevision:context.artifactRevision,selectedBlockIds:context.selectedBlockIds,editedPayload:command.payload}:{}
  }}});
 }
 remember(actor,guide,command.preparationId);
 const prepared=await verifiedCommand<GuideHandoff>(actor,command.preparation);
 if(!prepared.ok){if(!prepared.retryable)forget(actor,guide);return prepared;}
 const result=await writeAndRead(actor,guide,prepared.data.data);
 if(!result.ok&&!result.retryable)forget(actor,guide);
 return result;
}
export function pendingStudioGuide(actor:string,guide:string){try{return sessionStorage.getItem(key(actor,guide));}catch{return null;}}
export async function recoverStudioGuide(actor:string,guide:string){
 const requestId=pendingStudioGuide(actor,guide);if(!requestId)return{ok:false as const,code:'INVALID' as const,retryable:false};
 const r=await studioRepository(actor).getRequest(requestId);if(!r.ok)return r;
 if(r.data.status==='restricted'){forget(actor,guide);return{ok:false as const,code:'RESTRICTED' as const,retryable:false};}
 if(r.data.status!=='complete')return{ok:false as const,code:'UNAVAILABLE' as const,retryable:true};
 const handoff=r.data.receipt.data as GuideHandoff;
 if(handoff.guideId!==guide||!['save','publish'].includes(handoff.operation))return{ok:false as const,code:'INVALID' as const,retryable:false};
 return writeAndRead(actor,guide,handoff);
}
