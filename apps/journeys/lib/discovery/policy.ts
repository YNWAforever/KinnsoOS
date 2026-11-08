import type {DiscoveryIntent,DiscoveryRead} from './contracts.ts';
import {stableJson} from '../studio/contracts.ts';
export {stableJson};
export function object(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error('INVALID');
 const v=value as Record<string,unknown>;
 if(required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>![...required,...optional].includes(k)))throw Error('INVALID');
 return v;
}
export function text(value:unknown,max=200):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error('INVALID');return value;}
export function integer(value:unknown,min=0,max=100000000):number{if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)throw Error('INVALID');return value as number;}
// Canonical spelling is required before staging/hashing; PostgreSQL normalizes UUID text.
export function uuid(value:unknown):string{const s=text(value,36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s))throw Error('INVALID');return s;}
export function strings(value:unknown,max:number,allowed?:readonly string[],min=0):string[]{if(!Array.isArray(value)||value.length>max||value.length<min)throw Error('INVALID');const a=value.map(v=>text(v,120));if(new Set(a).size!==a.length||allowed&&a.some(v=>!allowed.includes(v)))throw Error('INVALID');return a;}
export async function hashValue(value:unknown):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(value)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export const commandDigest=(intent:DiscoveryIntent)=>hashValue(intent);
const FIELDS:Record<string,[string[],string[]?]>={
 savePreferences:[['favoriteCityKeys','interestTags','languages']],clearPreferences:[[]],saveIntent:[['cityKey','dateSpec','budget','interestTags','languages'],['linkedTripId']],archiveIntent:[[]],deleteIntent:[[]],
 beginLink:[['companyId','locationIds']],confirmLink:[['proof','readRefreshAllowed']],revokeLink:[[]],importOffer:[['linkId','offerId','expectedSourceRevision','locationId']],
 preparePublication:[['importId','cityKey','dateTimeZone','priceBasis','interestTags','languages','audiences','displayFields'],['campaignId']],grantContentUse:[['publicationContentVersion','allowedFields','purposes','expiresAt','rightsBasisRef','previewDigest','confirmed']],revokeContentUse:[[]],publishOffer:[['contentVersion','previewDigest','confirmed']],withdrawOffer:[[]],recordMatch:[['intentId','intentRevision']],chooseOffer:[['intentId','publicationId','choice']]
};
export function parseDiscoveryIntent(value:unknown):DiscoveryIntent{
 const v=object(value,['requestId','targetId','expectedRevision','command']);uuid(v.requestId);uuid(v.targetId);integer(v.expectedRevision);
 const c=object(v.command,['kind','data']),kind=text(c.kind);if(!Object.hasOwn(FIELDS,kind))throw Error('INVALID');
 const [required,optional]=FIELDS[kind],d=object(c.data,required,optional);
 for(const key of ['linkId','companyId','importId','intentId','publicationId','linkedTripId'])if(d[key]!==undefined)uuid(d[key]);
 for(const key of ['expectedSourceRevision','intentRevision','publicationContentVersion','contentVersion'])if(d[key]!==undefined)integer(d[key],1);
 for(const key of ['proof','offerId','locationId','rightsBasisRef','expiresAt','previewDigest','cityKey','dateTimeZone','priceBasis','campaignId'])if(d[key]!==undefined)text(d[key],key==='proof'?8000:200);
 if(d.confirmed!==undefined&&d.confirmed!==true)throw Error('INVALID');
 if(d.readRefreshAllowed!==undefined&&typeof d.readRefreshAllowed!=='boolean')throw Error('INVALID');
 if(d.locationIds!==undefined)strings(d.locationIds,20,undefined,1);
 if(d.purposes!==undefined)strings(d.purposes,6,['catalog','matching','private_brief','public_guide','trip_adoption','trip_share'],1);
 if(d.allowedFields!==undefined)strings(d.allowedFields,3,['title','details','terms'],1);
 if(d.displayFields!==undefined)strings(d.displayFields,3,['title','details','terms'],1);
 if(d.audiences!==undefined)strings(d.audiences,2,['traveller','creator'],1);
 if(d.choice!==undefined&&!['saved','dismissed','cleared'].includes(String(d.choice)))throw Error('INVALID');
 if(JSON.stringify(v).length>32000)throw Error('INVALID');
 return structuredClone(v) as DiscoveryIntent;
}
export function parseDiscoveryRead(value:unknown):DiscoveryRead{
 const v=object(value,['kind'],['id','companyId']);
 if(['preferences','intents','publicOffers'].includes(String(v.kind)))object(v,['kind']);
 else if(['intent','match'].includes(String(v.kind))){object(v,['kind','id']);uuid(v.id);}
 else if(v.kind==='companyOffers'){object(v,['kind','companyId']);uuid(v.companyId);}
 else throw Error('INVALID');return v as DiscoveryRead;
}
