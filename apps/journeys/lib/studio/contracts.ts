import type {DraftPayload,GuideDraft} from '../creators/contracts';
import type {SourceProvenance,ContentUseGrant} from '../discovery/contracts';
export type TemplateId='T1'|'T2'|'T3'|'T4'|'T5'|'C1'|'C2'|'C3'|'C4'|'C5'|'M1'|'M2'|'M3'|'M4'|'M5'|'O1'|'O2'|'O3'|'O4'|'O5';
export type StudioTopic='travel'|'creation'|'merchant'|'review'|'support';
export type SourceRef={sourceId:string;version:number;aclVersion:number;hash:string};
export type SourceDocument={id:string;threadId:string;ownerId:string;title:string;text:string;version:number;aclVersion:number;hash:string;rights:'own'|'unknown'|'licensed';status:'active'|'restricted';createdAt?:string;license?:{provenance:SourceProvenance;grants:ContentUseGrant[];fields:string[]}};
export type BriefBlock={id:string;title:string;text:string;sources:SourceRef[];intendedUse:'private'|'public-candidate'};
export type StudioBrief={id:string;threadId:string;revision:number;title:string;city:string;summary:string;blocks:BriefBlock[]};
export type StudioMessage={id:string;role:'user'|'assistant';body:string;sourceIds:string[]};
export type StudioThread={id:string;ownerId:string;topic:StudioTopic;templateId:TemplateId;title:string;revision:number;archived:boolean;messages:StudioMessage[];sources:SourceDocument[];artifacts:StudioBrief[]};
export type StudioEnvelope<T>={requestId:string;expectedRevision:number;payload:T};
export type StudioCommand={targetId:string;kind:'createThread'|'appendMessage'|'archiveThread'|'saveSource'|'restrictSource'|'saveArtifact'|'prepareGuideSave'|'prepareGuidePublish';data:Record<string,unknown>};
export type StudioReceipt<T>={requestId:string;resourceId:string;revision:number;digest:string;data:T};
export type StudioFailure={ok:false;code:'AUTH_REQUIRED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'INVALID' |'UNAVAILABLE'|'RESTRICTED'|'PILOT_REVIEW_REQUIRED';retryable:boolean};
export type StudioResponse<T>={ok:true;data:T}|StudioFailure;
export type GuideProjection={payload:DraftPayload;blockIds:string[];sources:SourceRef[]};
export type GuideHandoff={id:string;artifactId:string;artifactRevision:number;guideId:string;expectedRevision:number;domainRequestId:string;operation:'save'|'publish';payload:DraftPayload;digest:string};
export type StudioGuideBinding={artifactId:string;artifactRevision?:number;threadId:string;sourceCount:number;restricted:boolean};
export type StudioGuideDraft=GuideDraft&{studio?:StudioGuideBinding|null};
export function stableJson(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
 return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+stableJson(v)).join(',')+'}';
}
export const sameValue=(a:unknown,b:unknown)=>stableJson(a)===stableJson(b);
export const sourceRef=(s:SourceDocument):SourceRef=>({sourceId:s.id,version:s.version,aclVersion:s.aclVersion,hash:s.hash});
