const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const locales=new Set(['en','zh-HK']);
const creatorStatuses=new Set(['active','suspended','banned']);
const merchantStatuses=new Set(['active','paused','suspended','archived']);
const merchantTiers=new Set(['free','growth']);
const invalid=():never=>{throw Error('INVALID_OPS_RECORD')};

type Base={action:string;locale:'en'|'zh-HK';id:string;reason:string};
export type OpsRecordAction=
 | (Base&{action:'setCreatorStatus';status:'active'|'suspended'|'banned'})
 | (Base&{action:'setCreatorVerified';verified:boolean})
 | (Base&{action:'setCreatorListed';listed:boolean})
 | (Base&{action:'addCreatorNote'})
 | (Base&{action:'setMerchantStatus';status:'active'|'paused'|'suspended'|'archived'})
 | (Base&{action:'setMerchantTier';tier:'free'|'growth'})
 | (Base&{action:'addMerchantNote'});

export function parseOpsRecordAction(value:unknown):OpsRecordAction{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const body=value as Record<string,unknown>;
 if(typeof body.action!=='string'||typeof body.locale!=='string'||!locales.has(body.locale)||typeof body.id!=='string'||!uuid.test(body.id)||typeof body.reason!=='string')return invalid();
 const reason=body.reason.trim();
 if(!reason||reason.length>500)return invalid();
 const base={locale:body.locale as 'en'|'zh-HK',id:body.id,reason};
 const keys=Object.keys(body).sort();
 const exact=(allowed:string[])=>keys.length===allowed.length&&keys.every((key,index)=>key===allowed.slice().sort()[index]);
 switch(body.action){
  case 'setCreatorStatus':
   if(!exact(['action','id','locale','reason','status'])||typeof body.status!=='string'||!creatorStatuses.has(body.status))return invalid();
   return{action:body.action,...base,status:body.status as 'active'|'suspended'|'banned'};
  case 'setCreatorVerified':
   if(!exact(['action','id','locale','reason','verified'])||typeof body.verified!=='boolean')return invalid();
   return{action:body.action,...base,verified:body.verified};
  case 'setCreatorListed':
   if(!exact(['action','id','listed','locale','reason'])||typeof body.listed!=='boolean')return invalid();
   return{action:body.action,...base,listed:body.listed};
  case 'addCreatorNote':
   if(!exact(['action','id','locale','reason']))return invalid();
   return{action:body.action,...base};
  case 'setMerchantStatus':
   if(!exact(['action','id','locale','reason','status'])||typeof body.status!=='string'||!merchantStatuses.has(body.status))return invalid();
   return{action:body.action,...base,status:body.status as 'active'|'paused'|'suspended'|'archived'};
  case 'setMerchantTier':
   if(!exact(['action','id','locale','reason','tier'])||typeof body.tier!=='string'||!merchantTiers.has(body.tier))return invalid();
   return{action:body.action,...base,tier:body.tier as 'free'|'growth'};
  case 'addMerchantNote':
   if(!exact(['action','id','locale','reason']))return invalid();
   return{action:body.action,...base};
  default:return invalid();
 }
}
