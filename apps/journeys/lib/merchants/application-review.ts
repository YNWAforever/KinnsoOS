export type MerchantApplicationStatus='pending'|'approved'|'rejected';
export type MerchantApplication={id:string;companyName:string;contactName:string|null;contactEmail:string;websiteUrl:string|null;pitch:string|null;status:MerchantApplicationStatus;createdAt:string;decidedAt:string|null;decisionReason:string|null};
export type MerchantApplicationCursor={createdAt:string;id:string};
export type MerchantApplicationPage={applications:MerchantApplication[];nextCursor:MerchantApplicationCursor|null};
export type MerchantApplicationDecision={id:string;action:'approve'|'reject';reason:string};
export type ApplicationReviewMarker=MerchantApplicationDecision;
export type MerchantApplicationRow={id:string;company_name:string;contact_name:string|null;contact_email:string;website_url:string|null;pitch:string|null;status:MerchantApplicationStatus;created_at:string;decided_at:string|null;decision_reason:string|null};
export const APPLICATION_REVIEW_PAGE_SIZE=20;
export const APPLICATION_REVIEW_COLUMNS='id,company_name,contact_name,contact_email,website_url,pitch,status,created_at,decided_at,decision_reason';

const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function record(value:unknown,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw Error('INVALID');return value as Record<string,unknown>;}
function marker(value:unknown):Pick<MerchantApplicationDecision,'id'|'action'>{const input=record(value,['id','action']);if(!uuid(input.id)||(input.action!=='approve'&&input.action!=='reject'))throw Error('INVALID');return{id:input.id,action:input.action};}

export function merchantApplicationDecision(value:unknown):MerchantApplicationDecision{
 const input=record(value,['id','action','reason']);
 const intent=marker({id:input.id,action:input.action});
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>500)throw Error('INVALID');
 return{...intent,reason:input.reason.trim()};
}

export function merchantApplicationReviewQuery(params:URLSearchParams):{id:string|null;cursor:MerchantApplicationCursor|null}{
 if([...params.keys()].some(key=>!['id','after'].includes(key))||params.getAll('id').length>1||params.getAll('after').length>1||(params.has('id')&&params.has('after')))throw Error('INVALID');
 if(params.has('id')){const id=params.get('id');if(!uuid(id))throw Error('INVALID');return{id,cursor:null};}
 if(!params.has('after'))return{id:null,cursor:null};
 const text=params.get('after')!;if(!text||text.length>240)throw Error('INVALID');
 let value:unknown;try{value=JSON.parse(text);}catch{throw Error('INVALID');}
 const input=record(value,['createdAt','id']);
 // Keep the database's complete timestamp: rounding to milliseconds loses rows.
 if(!uuid(input.id)||typeof input.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.createdAt)||!Number.isFinite(Date.parse(input.createdAt)))throw Error('INVALID');
 return{id:null,cursor:{createdAt:input.createdAt,id:input.id}};
}

export function applicationWebsite(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048||/\s/.test(value))return null;
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

export function merchantApplicationFromRow(row:MerchantApplicationRow):MerchantApplication{
 return{id:row.id,companyName:row.company_name,contactName:row.contact_name,contactEmail:row.contact_email,websiteUrl:applicationWebsite(row.website_url),pitch:row.pitch,status:row.status,createdAt:row.created_at,decidedAt:row.decided_at,decisionReason:row.decision_reason};
}

const recoveryKey=(actorId:string)=>'kinnso:merchant-application-review:v1:'+actorId;
export function readApplicationReviewMarker(storage:Pick<Storage,'getItem'>,actorId:string):ApplicationReviewMarker|null{
 const value=storage.getItem(recoveryKey(actorId));if(value===null)return null;
 if(value.length>4096)throw Error('INVALID');return merchantApplicationDecision(JSON.parse(value));
}
export function storeApplicationReviewMarker(storage:Pick<Storage,'setItem'>,actorId:string,intent:ApplicationReviewMarker):void{
 // Tab-scoped, actor-specific recovery retains the exact immutable command until
 // a terminal outcome is confirmed. Company contact data and pitch never persist.
 storage.setItem(recoveryKey(actorId),JSON.stringify(merchantApplicationDecision({id:intent.id,action:intent.action,reason:intent.reason})));
}
export function clearApplicationReviewMarker(storage:Pick<Storage,'removeItem'>,actorId:string):void{storage.removeItem(recoveryKey(actorId));}
