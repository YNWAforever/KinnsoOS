export type CampaignSchedule={applicationOpensAt:string|null;applicationClosesAt:string|null;scheduleTimeZone:string};
export function scheduleTimestamp(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return false;
 const [year,month,day,hour,minute,second]=value.slice(0,19).split(/[-T:]/).map(Number);
 return year>=1&&month>=1&&month<=12&&day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate()&&hour<24&&minute<60&&second<60;
}
const micros=(value:string)=>BigInt(Date.parse(value))*BigInt(1000)+BigInt((value.match(/\.(\d{1,6})/)?.[1]??'').padEnd(6,'0').slice(3)||'0');
export function campaignSchedule(value:Record<string,unknown>):CampaignSchedule{
 const fields=['applicationOpensAt','applicationClosesAt','scheduleTimeZone'];
 if(fields.every(key=>!Object.hasOwn(value,key)))return{applicationOpensAt:null,applicationClosesAt:null,scheduleTimeZone:'UTC'};
 const {applicationOpensAt:opens,applicationClosesAt:closes,scheduleTimeZone:zone}=value;
 if(!fields.every(key=>Object.hasOwn(value,key))||(opens!==null&&!scheduleTimestamp(opens))||(closes!==null&&!scheduleTimestamp(closes))||typeof zone!=='string'||zone.length>80)throw Error('INVALID');
 try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{throw Error('INVALID');}
 if(opens!==null&&closes!==null&&micros(opens as string)>=micros(closes as string))throw Error('INVALID');
 return{applicationOpensAt:opens as string|null,applicationClosesAt:closes as string|null,scheduleTimeZone:zone};
}
export function scheduleDate(value:string,zone:string,locale:string):string{
 try{return new Intl.DateTimeFormat(locale==='zh-HK'?'zh-HK':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(value))+' ('+zone+')';}catch{return value;}
}
