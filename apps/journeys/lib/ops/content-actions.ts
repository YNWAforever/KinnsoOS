const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const locales=new Set(['en','zh-HK']);
const contentLocales=new Set(['en','zh-hk','zh-tw','zh-cn','ja','ko','th']);
const sessionTypes=new Set(['destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro']);
const sessionStatuses=new Set(['scheduled','live','ended','cancelled']);
const merchantTiers=new Set(['rising','pro','elite']);
const redemptionTypes=new Set(['code','link']);
const testimonialRoles=new Set(['creator','traveller','merchant']);
const testimonialStatuses=new Set(['draft','published']);
const enquiryStatuses=new Set(['new','in_progress','resolved','spam']);
const invalid=():never=>{throw Error('INVALID_OPS_CONTENT')};
const text=(value:unknown,min:number,max:number)=>{
 if(typeof value!=='string')return invalid();
 const result=value.trim();
 if(result.length<min||result.length>max)return invalid();
 return result;
};
const exact=(body:Record<string,unknown>,keys:string[])=>{
 const sorted=keys.slice().sort();
 return Object.keys(body).length===sorted.length&&Object.keys(body).sort().every((key,index)=>key===sorted[index]);
};
const youtube=(value:unknown)=>{
 if(value==='')return'';
 if(typeof value!=='string'||value.length>2048)return invalid();
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return invalid();
  const host=url.hostname.replace(/^(?:www|m)\./i,'').toLowerCase();
  if(host==='youtube.com'||host==='youtube-nocookie.com'||host==='youtu.be')return value;
 }catch{}
 return invalid();
};

type Base={locale:'en'|'zh-HK'};
export type OpsContentAction=
 | (Base&{action:'createSession';requestId:string;hostCreatorId:string;title:string;description:string;type:string;startsAt:string;durationMinutes:number;embedUrl:string;replayUrl:string;destinationTags:string[]})
 | (Base&{action:'setSessionStatus';id:string;status:'live'|'ended'|'cancelled'})
 | (Base&{action:'createPerk';requestId:string;partnerName:string;title:string;summary:string;category:string;discountLabel:string;minTier:'rising'|'pro'|'elite'|null;redemptionType:'code'|'link';redemptionValue:string;sortOrder:number;active:boolean})
 | (Base&{action:'setPerkActive';id:string;active:boolean})
 | (Base&{action:'createTestimonial';requestId:string;quote:string;authorName:string;authorRole:'creator'|'traveller'|'merchant';contentLocale:'en'|'zh-hk'|'zh-tw'|'zh-cn'|'ja'|'ko'|'th'|null;sortOrder:number})
 | (Base&{action:'setTestimonialStatus';id:string;status:'draft'|'published'})
 | (Base&{action:'setEnquiryStatus';id:string;status:'new'|'in_progress'|'resolved'|'spam';reason:string});

export function parseOpsContentAction(value:unknown):OpsContentAction{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const body=value as Record<string,unknown>;
 if(typeof body.action!=='string'||typeof body.locale!=='string'||!locales.has(body.locale))return invalid();
 const locale=body.locale as 'en'|'zh-HK';
 switch(body.action){
  case 'createSession':{
   if(!exact(body,['action','locale','requestId','hostCreatorId','title','description','type','startsAt','durationMinutes','embedUrl','replayUrl','destinationTags'])||typeof body.requestId!=='string'||!uuid.test(body.requestId)||typeof body.hostCreatorId!=='string'||!uuid.test(body.hostCreatorId)||typeof body.type!=='string'||!sessionTypes.has(body.type)||typeof body.startsAt!=='string'||!Number.isFinite(Date.parse(body.startsAt))||!Number.isInteger(body.durationMinutes)||Number(body.durationMinutes)<1||Number(body.durationMinutes)>1440||!Array.isArray(body.destinationTags)||body.destinationTags.length>20)return invalid();
   const destinationTags=body.destinationTags.map(tag=>text(tag,1,40));
   if(new Set(destinationTags).size!==destinationTags.length)return invalid();
   return{action:body.action,locale,requestId:body.requestId,hostCreatorId:body.hostCreatorId,title:text(body.title,1,160),description:text(body.description,1,4000),type:body.type,startsAt:new Date(body.startsAt).toISOString(),durationMinutes:body.durationMinutes as number,embedUrl:youtube(body.embedUrl),replayUrl:youtube(body.replayUrl),destinationTags};
  }
  case 'setSessionStatus':
   if(!exact(body,['action','locale','id','status'])||typeof body.id!=='string'||!uuid.test(body.id)||typeof body.status!=='string'||!['live','ended','cancelled'].includes(body.status))return invalid();
   return{action:body.action,locale,id:body.id,status:body.status as 'live'|'ended'|'cancelled'};
  case 'createPerk':{
   if(!exact(body,['action','locale','requestId','partnerName','title','summary','category','discountLabel','minTier','redemptionType','redemptionValue','sortOrder','active'])||typeof body.requestId!=='string'||!uuid.test(body.requestId)||typeof body.redemptionType!=='string'||!redemptionTypes.has(body.redemptionType)||!Number.isInteger(body.sortOrder)||typeof body.active!=='boolean'||!(body.minTier===null||(typeof body.minTier==='string'&&merchantTiers.has(body.minTier))))return invalid();
   const redemptionValue=text(body.redemptionValue,1,2048);
   if(body.redemptionType==='link'){try{const url=new URL(redemptionValue);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return invalid();}catch{return invalid();}}
   return{action:body.action,locale,requestId:body.requestId,partnerName:text(body.partnerName,1,120),title:text(body.title,1,160),summary:text(body.summary,1,1000),category:text(body.category,1,80),discountLabel:text(body.discountLabel,1,80),minTier:body.minTier as 'rising'|'pro'|'elite'|null,redemptionType:body.redemptionType as 'code'|'link',redemptionValue,sortOrder:body.sortOrder as number,active:body.active};
  }
  case 'setPerkActive':
   if(!exact(body,['action','locale','id','active'])||typeof body.id!=='string'||!uuid.test(body.id)||typeof body.active!=='boolean')return invalid();
   return{action:body.action,locale,id:body.id,active:body.active};
  case 'createTestimonial':{
   if(!exact(body,['action','locale','requestId','quote','authorName','authorRole','contentLocale','sortOrder'])||typeof body.requestId!=='string'||!uuid.test(body.requestId)||typeof body.authorRole!=='string'||!testimonialRoles.has(body.authorRole)||!(body.contentLocale===null||(typeof body.contentLocale==='string'&&contentLocales.has(body.contentLocale)))||!Number.isInteger(body.sortOrder))return invalid();
   return{action:body.action,locale,requestId:body.requestId,quote:text(body.quote,1,2000),authorName:text(body.authorName,1,120),authorRole:body.authorRole as 'creator'|'traveller'|'merchant',contentLocale:body.contentLocale as OpsContentAction extends never?never:'en'|'zh-hk'|'zh-tw'|'zh-cn'|'ja'|'ko'|'th'|null,sortOrder:body.sortOrder as number};
  }
  case 'setTestimonialStatus':
   if(!exact(body,['action','locale','id','status'])||typeof body.id!=='string'||!uuid.test(body.id)||typeof body.status!=='string'||!testimonialStatuses.has(body.status))return invalid();
   return{action:body.action,locale,id:body.id,status:body.status as 'draft'|'published'};
  case 'setEnquiryStatus':{
   if(!exact(body,['action','locale','id','status','reason'])||typeof body.id!=='string'||!uuid.test(body.id)||typeof body.status!=='string'||!enquiryStatuses.has(body.status)||typeof body.reason!=='string')return invalid();
   const reason=body.reason.trim();
   if(reason.length>500||((body.status==='resolved'||body.status==='spam')&&!reason))return invalid();
   return{action:body.action,locale,id:body.id,status:body.status as 'new'|'in_progress'|'resolved'|'spam',reason};
  }
  default:return invalid();
 }
}
