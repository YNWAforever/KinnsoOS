import {createHash} from 'node:crypto';
import {uuid} from '../api/validation.ts';
import {recoverShareToken} from './share-receipt-crypto.ts';
import type {ShareIntent,ShareReceipt,ShareReceiptRow,ShareReceiptPage} from '../contracts/share-receipts';
import type {PublicTripProjection,PublicDay} from '../contracts/trips';
const invalid=()=>new Error('Invalid share receipt');
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();return value as Record<string,unknown>;}
function ids(value:unknown,limit:number):string[]{if(!Array.isArray(value)||value.length>limit||value.some(id=>!uuid(id))||new Set(value.map(id=>id.toLowerCase())).size!==value.length)throw invalid();return value;}
const timestamp=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function shareIntent(value:unknown):ShareIntent {
 const r=record(value);if(!uuid(r.tripId)||!uuid(r.requestId)||!timestamp(r.expiresAt))throw invalid();
 return {requestId:r.requestId,tripId:r.tripId,stopIds:ids(r.stopIds,200),mediaIds:ids(r.mediaIds,20),expiresAt:r.expiresAt};
}
function receiptRow(value:unknown):ShareReceiptRow {
 const r=record(value);if(!uuid(r.id)||!uuid(r.requestId)||!timestamp(r.createdAt)||!timestamp(r.expiresAt)||!['active','revoked','expired'].includes(String(r.state)))throw invalid();
 return {id:r.id,requestId:r.requestId,createdAt:r.createdAt,expiresAt:r.expiresAt,state:r.state as ShareReceiptRow['state']};
}
function publicProjection(value:unknown):PublicTripProjection {
 const p=record(value);if(typeof p.title!=='string'||!Array.isArray(p.days))throw invalid();
 const approvedMediaIds=ids(p.approvedMediaIds,20);
 const days=p.days.map(raw=>{const d=record(raw);if(!uuid(d.id)||typeof d.title!=='string'||!Number.isInteger(d.offset)||!Array.isArray(d.stops))throw invalid();
  return {id:d.id,title:d.title,offset:d.offset,stops:d.stops.map(rawStop=>{const s=record(rawStop);
   if(!uuid(s.id)||typeof s.title!=='string'||!(s.placeId===null||uuid(s.placeId))||!Number.isInteger(s.position)||typeof s.description!=='string'||
    ![s.startMinuteOfDay,s.durationMinutes].every(x=>x===null||typeof x==='number'&&Number.isFinite(x)))throw invalid();
   let source=null;
   if(s.source!==null){const a=record(s.source);if(!uuid(a.guideId)||!(a.creatorId===null||uuid(a.creatorId))||!Number.isInteger(a.guideVersion)||typeof a.creatorName!=='string'||typeof a.withdrawn!=='boolean'||!(a.canonicalUrl===null||typeof a.canonicalUrl==='string'))throw invalid();
    source={guideId:a.guideId,guideVersion:a.guideVersion,creatorId:a.creatorId,creatorName:a.creatorName,canonicalUrl:a.canonicalUrl,withdrawn:a.withdrawn};}
   return {id:s.id,title:s.title,placeId:s.placeId,position:s.position,startMinuteOfDay:s.startMinuteOfDay,durationMinutes:s.durationMinutes,description:s.description,source};
  })};
 }) as PublicDay[];
 return {title:p.title,approvedMediaIds,days};
}
export function shareReceipt(value:unknown,actorId:string,tripId:string,requestId:string,env:Record<string,string|undefined>=process.env):ShareReceipt {
 const raw=record(value),row=receiptRow(raw),intent=shareIntent(raw.intent);
 if(row.requestId.toLowerCase()!==requestId.toLowerCase()||intent.requestId.toLowerCase()!==requestId.toLowerCase()||intent.tripId.toLowerCase()!==tripId.toLowerCase()||Date.parse(row.expiresAt)!==Date.parse(intent.expiresAt))throw invalid();
 const projection=publicProjection(raw.projection);let url:string|null=null;
 if(row.state==='active'){
  const token=recoverShareToken(raw.envelope,{actorId,tripId,requestId},env);
  if(typeof raw.tokenHash!=='string'||createHash('sha256').update(token).digest('hex')!==raw.tokenHash)throw invalid();
  const site=new URL(env.KINNSO_SITE_URL??'');if(site.username||site.password||site.pathname!=='/'||site.search||site.hash||
   !(site.protocol==='https:'||env.KINNSO_ENVIRONMENT==='local'&&site.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(site.hostname)))throw invalid();
  url=new URL('/share/'+token,site).href;
 }
 return {...row,intent,projection,url};
}
export function shareReceiptPage(value:unknown):ShareReceiptPage {
 const p=record(value);if(!Array.isArray(p.items)||p.items.length>20)throw invalid();
 const items=p.items.map(receiptRow);let nextCursor=null;
 if(p.nextCursor!==null){const c=record(p.nextCursor);if(items.length!==20||!timestamp(c.createdAt)||!uuid(c.requestId))throw invalid();
  const last=items[items.length-1];if(last.createdAt!==c.createdAt||last.requestId!==c.requestId)throw invalid();nextCursor={createdAt:c.createdAt,requestId:c.requestId};}
 return {items,nextCursor};
}
