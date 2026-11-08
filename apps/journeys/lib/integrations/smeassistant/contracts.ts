import {object,text,integer,strings} from '../../discovery/policy.ts';
import type {OfferEvidence} from '../../discovery/contracts.ts';
export const SME_TOOLS=['sme_connection_status_v1','sme_link_attestation_v1','sme_merchant_context_v1','sme_confirmed_offers_v1','sme_offer_evidence_v1','sme_validate_offer_refs_v1'] as const;
export type ToolName=typeof SME_TOOLS[number];
export const SME_ERRORS=['NOT_CONNECTED','FORBIDDEN','UNAVAILABLE','SOURCE_CHANGED','INVALID','RATE_LIMITED','TIMEOUT','UNSUPPORTED'] as const;
export type SmeReadResult<T>={schemaVersion:'kinnso.sme.read.v1';status:'ready'|'empty'|'partial';requestId:string;observedAt:string;scope:{workspaceId:string;locationId:string|null;scopeVersion:number};data:T;warnings:{code:string;field?:string}[]}|{schemaVersion:'kinnso.sme.read.v1';status:'error';requestId:string;code:typeof SME_ERRORS[number];retryable:boolean;retryAfterSeconds?:number};
export type VerifiedSmePrincipal={fixture:true;issuer:string;subject:string;audience:string;workspaceId:string;role:'owner'|'member';scopes:string[];locationIds:string[];scopeVersion:number;active:boolean};
export type AuthFailure={code:'FORBIDDEN'|'NOT_CONNECTED'};
export interface McpAuthVerifier{verify(request:unknown):Promise<VerifiedSmePrincipal|AuthFailure>}
export type VerifiedLinkContext={companyId:string;locationIds:string[];workspaceId:string;readRefreshAllowed:boolean};
export type ToolInput=Record<string,unknown>;
const timestamp=(value:unknown)=>{text(value);if(!Number.isFinite(Date.parse(value as string)))throw Error('INVALID');};
const hash=(value:unknown)=>{if(!/^[a-f0-9]{64}$/.test(text(value)))throw Error('INVALID');};
export function parseOfferEvidence(value:unknown):OfferEvidence{
 const v=object(value,['offerId','revision','hash','sourceLocationId','appliedLocationId','title','details','terms','validFrom','validUntil','priceAmount','currency','claims','prohibitedTerms','observedAt','sourceStatus','rightsState']);
 for(const k of ['offerId','appliedLocationId','title','details'])text(v[k],k==='details'?10000:200);
 if(typeof v.terms!=='string'||v.terms.length>10000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.terms))throw Error('INVALID');
 if(v.sourceLocationId!==null)text(v.sourceLocationId);integer(v.revision,1);hash(v.hash);timestamp(v.observedAt);
 for(const key of ['validFrom','validUntil']){if(!/^\d{4}-\d{2}-\d{2}$/.test(text(v[key]))||new Date(String(v[key])+'T00:00:00Z').toISOString().slice(0,10)!==v[key])throw Error('INVALID');}
 if(String(v.validFrom)>String(v.validUntil))throw Error('INVALID');
 if(v.priceAmount===null){if(v.currency!==null)throw Error('INVALID');}
 else if(!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(String(v.priceAmount))||typeof v.priceAmount!=='string'||!['HKD','TWD'].includes(String(v.currency)))throw Error('INVALID');
 for(const key of ['claims','prohibitedTerms']){if(!Array.isArray(v[key])||v[key].length>20||new Set(v[key]).size!==v[key].length)throw Error('INVALID');(v[key] as unknown[]).forEach(x=>text(x,200));}
 if(!['confirmed','expired','archived'].includes(String(v.sourceStatus))||v.rightsState!=='unverified_for_kinnso_reuse')throw Error('INVALID');
 return v as OfferEvidence;
}
export function parseSmeInput(tool:ToolName,value:unknown):ToolInput{
 if(!SME_TOOLS.includes(tool))throw Error('UNSUPPORTED');
 let v:Record<string,unknown>;
 switch(tool){
 case 'sme_connection_status_v1':return object(value,[]);
 case 'sme_link_attestation_v1':v=object(value,['nonce','companyBindingHash','locationIds']);if(!/^[A-Za-z0-9_-]{43}$/.test(text(v.nonce)))throw Error('INVALID');hash(v.companyBindingHash);strings(v.locationIds,20,undefined,1);break;
 case 'sme_merchant_context_v1':v=object(value,['locationId','locale']);if(!['en','zh-HK','zh-TW'].includes(String(v.locale)))throw Error('INVALID');break;
 case 'sme_confirmed_offers_v1':v=object(value,['locationId'],['cursor','limit']);if(v.limit!==undefined)integer(v.limit,1,50);if(v.cursor!==undefined)text(v.cursor,300);break;
 case 'sme_offer_evidence_v1':v=object(value,['offerId','expectedRevision','locationId']);text(v.offerId);integer(v.expectedRevision,1);break;
 case 'sme_validate_offer_refs_v1':v=object(value,['refs']);if(!Array.isArray(v.refs)||!v.refs.length||v.refs.length>20)throw Error('INVALID');for(const r of v.refs){const ref=object(r,['offerId','revision','hash','locationId']);text(ref.offerId);text(ref.locationId);integer(ref.revision,1);hash(ref.hash);}break;
 }
 if(v.locationId!==undefined)text(v.locationId);return v;
}
export function parseSmeResult(tool:ToolName,value:unknown):SmeReadResult<unknown>{
 if(!SME_TOOLS.includes(tool))throw Error('UNSUPPORTED');
 if(new TextEncoder().encode(JSON.stringify(value)).length>1048576)throw Error('INVALID');
 if(!value||typeof value!=='object')throw Error('INVALID');
 const failed=(value as Record<string,unknown>).status==='error';
 const v=failed?object(value,['schemaVersion','status','requestId','code','retryable'],['retryAfterSeconds']):object(value,['schemaVersion','status','requestId','observedAt','scope','data','warnings']);
 if(v.schemaVersion!=='kinnso.sme.read.v1')throw Error('INVALID');text(v.requestId);
 if(failed){if(!SME_ERRORS.includes(v.code as typeof SME_ERRORS[number])||typeof v.retryable!=='boolean')throw Error('INVALID');if(v.retryAfterSeconds!==undefined)integer(v.retryAfterSeconds,0,3600);return v as SmeReadResult<unknown>;}
 if(!['ready','empty','partial'].includes(String(v.status)))throw Error('INVALID');timestamp(v.observedAt);
 const scope=object(v.scope,['workspaceId','locationId','scopeVersion']);text(scope.workspaceId);if(scope.locationId!==null)text(scope.locationId);integer(scope.scopeVersion,1);
 if(!Array.isArray(v.warnings)||v.warnings.length>20)throw Error('INVALID');for(const w of v.warnings){const warning=object(w,['code'],['field']);text(warning.code);if(warning.field!==undefined)text(warning.field);}
 if(tool==='sme_offer_evidence_v1')parseOfferEvidence(v.data);
 else {
 const fields:Record<string,string[]>={sme_connection_status_v1:['status','scopes','scopeVersion','locationIds','lastVerifiedAt'],sme_link_attestation_v1:['proof','expiresAt'],sme_merchant_context_v1:['publicName','websiteUrl','market','locationId','availableFields','observedAt'],sme_confirmed_offers_v1:['items','nextCursor'],sme_validate_offer_refs_v1:['items']};
 const d=object(v.data,fields[tool]);
 if(tool==='sme_confirmed_offers_v1'){if(!Array.isArray(d.items)||d.items.length>50)throw Error('INVALID');d.items.forEach(parseOfferEvidence);if(d.nextCursor!==null)text(d.nextCursor,300);}
 if(tool==='sme_validate_offer_refs_v1'){if(!Array.isArray(d.items)||d.items.length>20)throw Error('INVALID');for(const i of d.items){const r=object(i,['offerId','state','checkedAt'],['currentRevision']);text(r.offerId);timestamp(r.checkedAt);if(!['current','changed','expired','archived','unavailable'].includes(String(r.state)))throw Error('INVALID');if(r.currentRevision!==undefined)integer(r.currentRevision,1);}}
 if(tool==='sme_link_attestation_v1'){text(d.proof,8000);timestamp(d.expiresAt);}
 if(tool==='sme_connection_status_v1'){if(!['active','reconnect','revoked','unverified'].includes(String(d.status)))throw Error('INVALID');strings(d.scopes,10);strings(d.locationIds,20);integer(d.scopeVersion,1);timestamp(d.lastVerifiedAt);}
 if(tool==='sme_merchant_context_v1'){text(d.publicName);text(d.market);text(d.locationId);timestamp(d.observedAt);strings(d.availableFields,20);if(d.websiteUrl!==null){const u=new URL(text(d.websiteUrl));if(u.protocol!=='https:'||u.username||u.password)throw Error('INVALID');}}
 }
 return v as SmeReadResult<unknown>;
}
