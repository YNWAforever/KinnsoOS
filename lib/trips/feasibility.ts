import type {TripSnapshot} from '../contracts/trips';import type {PlaceFact} from '../places/contracts';
export type Warning={code:string;dayId:string;stopId:string|null;severity:'info'|'warning';messageKey:string};
function wallCandidates(date:string,minute:number,zone:string) {
 const [year,month,day]=date.split('-').map(Number),target=Date.UTC(year,month-1,day,Math.floor(minute/60),minute%60),offsets=new Set<number>();
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const local=(time:number)=>{const p=Object.fromEntries(formatter.formatToParts(time).map(v=>[v.type,v.value]));return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute))};
 for(let delta=-36;delta<=36;delta+=6){const at=target+delta*3600000;offsets.add(local(at)-at)}
 return [...offsets].map(offset=>target-offset).filter(at=>local(at)===target).length;
}
export function assessItinerary(snapshot:TripSnapshot,placeFacts:PlaceFact[],now=new Date()):Warning[] {
 const warnings:Warning[]=[],facts=new Map(placeFacts.map(f=>[f.placeId,f]));
 for(const day of snapshot.days){
  const add=(code:string,stopId:string|null,severity:'info'|'warning'='warning')=>warnings.push({code,dayId:day.id,stopId,severity,messageKey:code});
  const date=snapshot.startDate?new Date(Date.parse(snapshot.startDate+'T00:00:00Z')+day.offset*86400000).toISOString().slice(0,10):null;
  if(!date)add('UNDATED',null,'info');let end:number|null=null;
  for(const [index,stop] of day.stops.entries()) {
   const fact=stop.placeId?facts.get(stop.placeId):undefined,minute=stop.startMinuteOfDay;
   if(index>0)add('UNKNOWN_TRAVEL',stop.id,'info');
   if(!fact?.openingHours||!fact.verifiedAt||!fact.sourceUrl)add('UNVERIFIED_HOURS',stop.id,'info');
   else if(now.getTime()-Date.parse(fact.verifiedAt)>90*86400000)add('PLACE_STALE',stop.id,'info');
   if(minute===null){add('MISSING_TIME',stop.id,'info');end=null;continue}
   if(end!==null&&minute<end)add('OVERLAP',stop.id);
   end=stop.durationMinutes===null?null:minute+stop.durationMinutes;
   if(end!==null&&end>1440)add('CROSS_DAY',stop.id);
   if(date){
    const candidates=wallCandidates(date,minute,snapshot.timezone);if(candidates===0)add('DST_GAP',stop.id);if(candidates>1)add('DST_FOLD',stop.id);
    if(fact?.timezone&&fact.timezone!==snapshot.timezone)add('TIMEZONE_MISMATCH',stop.id);
    if(fact?.openingHours&&fact.verifiedAt&&fact.sourceUrl){const weekday=new Date(date+'T00:00:00Z').getUTCDay();const periods=fact.openingHours.filter(h=>h.weekday===weekday);
     if(!periods.length||!periods.some(h=>minute>=h.openMinute&&minute<(h.closeMinute<h.openMinute?h.closeMinute+1440:h.closeMinute)))add('OUTSIDE_HOURS',stop.id);
    }
   }
  }
 }
 return warnings;
}
