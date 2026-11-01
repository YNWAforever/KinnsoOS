import {CITIES,type ContentUseGrant,type GrantPurpose,type OfferImport,type OfferPublication,type PublicationDraftInput,type PublicationConfirmation,type SourceProvenance} from './contracts.ts';
import {hashValue,strings,stableJson} from './policy.ts';
export const importKey=(i:Pick<OfferImport,'linkId'|'externalOfferId'|'sourceRevision'|'appliedLocationId'>)=>stableJson([i.linkId,i.externalOfferId,i.sourceRevision,i.appliedLocationId]);
export function assertSameImport(a:OfferImport,b:OfferImport){if(importKey(a)===importKey(b)&&a.sourceHash!==b.sourceHash)throw Error('SOURCE_CHANGED');}
export type GrantDecision={allowed:true}|{allowed:false;reason:'RESTRICTED'|'SOURCE_CHANGED'|'CONFLICT'};
export function checkContentGrant(grant:ContentUseGrant|undefined,source:Pick<SourceProvenance,'publicationId'|'contentVersion'|'contentHash'|'grantRefs'>,purpose:GrantPurpose,now:Date):GrantDecision{
 const ref=source.grantRefs.find(r=>r.purpose===purpose);
 return grant&&ref&&grant.id===ref.id&&grant.grantVersion===ref.version&&grant.publicationId===source.publicationId&&grant.publicationContentVersion===source.contentVersion&&grant.contentHash===source.contentHash&&grant.purpose===purpose&&grant.verificationState==='approved'&&!grant.revokedAt&&Date.parse(grant.expiresAt)>+now?{allowed:true}:{allowed:false,reason:'RESTRICTED'};
}
export function grantFor(publication:OfferPublication,grants:ContentUseGrant[],purpose:GrantPurpose,now:Date){
 const grant=grants.find(g=>g.publicationId===publication.id&&g.publicationContentVersion===publication.contentVersion&&g.purpose===purpose&&!g.revokedAt);
 if(!grant||publication.displayFields.some(f=>!grant.allowedFields.includes(f)))return undefined;
 return checkContentGrant(grant,{publicationId:publication.id,contentVersion:publication.contentVersion,contentHash:publication.contentHash,grantRefs:[{purpose,id:grant.id,version:grant.grantVersion}]},purpose,now).allowed?grant:undefined;
}
export async function preparePublication(input:PublicationDraftInput,context:{current:OfferPublication;offerImport:OfferImport;companyId:string;role:string;now:Date}):Promise<OfferPublication>{
 const {current,offerImport,role,companyId}=context;
 if(role!=='owner'||current.companyId!==companyId)throw Error('FORBIDDEN');if(current.status==='published')throw Error('CONFLICT');
 const city=CITIES.find(c=>c.key===input.cityKey);if(!city)throw Error('UNSUPPORTED');
 if(city.timeZone!==input.dateTimeZone||input.importId!==offerImport.id||!['per_person','other','unknown'].includes(input.priceBasis))throw Error('INVALID');
 strings(input.interestTags,10);strings(input.languages,5,['en','zh-HK','zh-TW']);strings(input.audiences,2,['traveller','creator'],1);strings(input.displayFields,3,['title','details','terms'],1);
 if(!input.displayFields.includes('title')||!input.displayFields.includes('terms'))throw Error('INVALID');
 if(offerImport.fields.sourceStatus!=='confirmed')throw Error('SOURCE_CHANGED');
 const contentVersion=current.contentVersion+1,contentHash=await hashValue({input,sourceHash:offerImport.sourceHash});
 const previewDigest=await hashValue({publicationId:current.id,contentVersion,contentHash});
 return {...structuredClone(input),id:current.id,companyId,revision:current.revision+1,contentVersion,contentHash,previewDigest,status:'draft',publishedAt:null,withdrawnAt:null};
}
export function validatePublication(input:PublicationConfirmation,context:{publication:OfferPublication;grants:ContentUseGrant[];sourceCurrent:boolean;now:Date}):GrantDecision{
 const {publication:p,grants,sourceCurrent,now}=context;
 if(!sourceCurrent)return {allowed:false,reason:'SOURCE_CHANGED'};
 if(input.confirmed!==true||input.contentVersion!==p.contentVersion||input.previewDigest!==p.previewDigest||p.status!=='draft')return {allowed:false,reason:'CONFLICT'};
 if(!grantFor(p,grants,'catalog',now)||!grantFor(p,grants,'matching',now))return {allowed:false,reason:'RESTRICTED'};
 return {allowed:true};
}
