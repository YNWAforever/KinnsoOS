export const MAX_LEGACY_ANALYTICS_BYTES=8192;
const MAX_CLOCK_SKEW_MS=15*60*1000;
const events=new Set(['journey_started','entity_viewed','agent_started','booking_cta_clicked','waitlist_submitted','checkout_started','signup_started','signup_completed','offer_viewed','offer_claimed']);
const locales=new Set(['en','zh-hk','zh-tw','zh-cn','ja','ko','th']);
const entityTypes=new Set(['guide','experience','creator','article','offer']);
const outcomes=new Set(['created','submitted','success','error']);
const errors=new Set(['invalid','rate_limited','unavailable','unknown']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entity=/^[A-Za-z0-9_-]{1,120}$/;
const route=/^[a-z0-9_/-]{1,80}$/;
const allowedKeys=['clientEventId','journeyId','consentVersion','event','occurredAt','locale','routeKey','entityType','entityId','bookingState','outcome','errorCategory'];

export type LegacyAnalyticsPayload={
 clientEventId:string;journeyId:string;consentVersion:'v1';event:string;occurredAt:string;locale:string;routeKey:string;
 entityType?:string;entityId?:string;bookingState?:'off'|'on';outcome?:string;errorCategory?:string;
};
export class LegacyAnalyticsError extends Error{
 readonly code:'invalid_request'|'payload_too_large';
 readonly status:400|413;
 constructor(code:'invalid_request'|'payload_too_large',status:400|413){
  super(code);
  this.code=code;
  this.status=status;
 }
}

function record(value:unknown):Record<string,unknown>|null{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function optional(value:unknown,values:Set<string>,name:string){
 if(value===undefined)return undefined;
 if(typeof value!=='string'||!values.has(value))throw Error(name);
 return value;
}
function noEntity(value:Record<string,unknown>){return value.entityType===undefined&&value.entityId===undefined;}
function noOutcome(value:Record<string,unknown>){return value.outcome===undefined&&value.errorCategory===undefined;}
function noBooking(value:Record<string,unknown>){return value.bookingState===undefined;}
function entityIs(value:Record<string,unknown>,type:string,routeKey:string){
 return value.routeKey===routeKey&&value.entityType===type&&typeof value.entityId==='string'&&entity.test(value.entityId);
}
function validSemantics(value:LegacyAnalyticsPayload){
 const raw=value as unknown as Record<string,unknown>;
 if(value.errorCategory!==undefined&&value.outcome!=='error')return false;
 if(value.outcome==='error'&&value.errorCategory===undefined)return false;
 switch(value.event){
  case 'journey_started':return value.routeKey==='journey'&&noEntity(raw)&&noBooking(raw)&&noOutcome(raw);
  case 'entity_viewed':return (value.routeKey==='guide_detail'&&entityIs(raw,'guide',value.routeKey))||(value.routeKey==='experience_detail'&&entityIs(raw,'experience',value.routeKey))||(value.routeKey==='creator_profile'&&entityIs(raw,'creator',value.routeKey))||(value.routeKey==='article_detail'&&entityIs(raw,'article',value.routeKey));
  case 'agent_started':return value.routeKey==='agent'&&noEntity(raw)&&noBooking(raw)&&noOutcome(raw);
  case 'offer_viewed':
  case 'offer_claimed':return (value.routeKey==='guide_detail'||value.routeKey==='creator_profile')&&entityIs(raw,'offer',value.routeKey)&&noBooking(raw)&&noOutcome(raw);
  case 'booking_cta_clicked':return entityIs(raw,'experience','experience_detail')&&value.bookingState!==undefined&&noOutcome(raw);
  case 'waitlist_submitted':return entityIs(raw,'experience','experience_detail')&&value.bookingState==='off'&&(value.outcome==='submitted'||value.outcome==='error');
  case 'checkout_started':return entityIs(raw,'experience','experience_detail')&&value.bookingState==='on'&&(value.outcome==='created'||value.outcome==='error');
  case 'signup_started':return value.routeKey==='sign_up'&&noEntity(raw)&&noBooking(raw)&&noOutcome(raw);
  case 'signup_completed':return value.routeKey==='sign_up'&&noEntity(raw)&&noBooking(raw)&&(value.outcome==='success'||value.outcome==='error');
  default:return false;
 }
}

export function parseLegacyAnalyticsPayload(value:unknown,now=Date.now()):LegacyAnalyticsPayload{
 const body=record(value);
 if(!body||Object.keys(body).some(key=>!allowedKeys.includes(key)))throw Error('invalid_request');
 if(typeof body.clientEventId!=='string'||!uuid.test(body.clientEventId)||typeof body.journeyId!=='string'||!uuid.test(body.journeyId)||body.consentVersion!=='v1'||typeof body.event!=='string'||!events.has(body.event)||typeof body.occurredAt!=='string'||!Number.isFinite(Date.parse(body.occurredAt))||Math.abs(now-Date.parse(body.occurredAt))>MAX_CLOCK_SKEW_MS||typeof body.locale!=='string'||!locales.has(body.locale)||typeof body.routeKey!=='string'||!route.test(body.routeKey))throw Error('invalid_request');
 const payload:LegacyAnalyticsPayload={clientEventId:body.clientEventId,journeyId:body.journeyId,consentVersion:'v1',event:body.event,occurredAt:new Date(body.occurredAt).toISOString(),locale:body.locale,routeKey:body.routeKey};
 if(body.entityType!==undefined)payload.entityType=optional(body.entityType,entityTypes,'invalid_request');
 if(body.entityId!==undefined){if(typeof body.entityId!=='string'||!entity.test(body.entityId))throw Error('invalid_request');payload.entityId=body.entityId;}
 if(body.bookingState!==undefined)payload.bookingState=optional(body.bookingState,new Set(['off','on']),'invalid_request') as 'off'|'on';
 if(body.outcome!==undefined)payload.outcome=optional(body.outcome,outcomes,'invalid_request');
 if(body.errorCategory!==undefined)payload.errorCategory=optional(body.errorCategory,errors,'invalid_request');
 if(!validSemantics(payload))throw Error('invalid_request');
 return payload;
}

export async function parseLegacyAnalyticsRequest(request:Request,now=Date.now()){
 const length=Number(request.headers.get('content-length')??0);
 if(length>MAX_LEGACY_ANALYTICS_BYTES)throw new LegacyAnalyticsError('payload_too_large',413);
 const raw=await request.text();
 if(new TextEncoder().encode(raw).byteLength>MAX_LEGACY_ANALYTICS_BYTES)throw new LegacyAnalyticsError('payload_too_large',413);
 try{return parseLegacyAnalyticsPayload(JSON.parse(raw),now);}catch(error){if(error instanceof LegacyAnalyticsError)throw error;throw new LegacyAnalyticsError('invalid_request',400);}
}
