import type {DraftContent,DraftPayload} from './contracts';
export type PublicationIssue={code:'title'|'city'|'summary'|'days'|'stops'|'stopTitle';day?:number;stop?:number};
/** Completeness guidance for an editing draft; publication still uses server validation. */
export function publicationReadiness(payload:DraftPayload):{dayCount:number;stopCount:number;issues:PublicationIssue[]}{
 const issues:PublicationIssue[]=[];
 for(const code of ['title','city','summary'] as const)if(!payload[code].trim())issues.push({code});
 const days=payload.content.days;let stopCount=0;
 if(!days.length)issues.push({code:'days'});
 days.forEach((day,di)=>{
  if(!day.stops.length)issues.push({code:'stops',day:di});
  day.stops.forEach((stop,si)=>{stopCount++;if(!stop.title.trim())issues.push({code:'stopTitle',day:di,stop:si});});
 });
 return{dayCount:days.length,stopCount,issues};
}
export function parseTimeOfDay(value:string):{ok:true;minutes:number|null}|{ok:false}{
 if(value==='')return{ok:true,minutes:null};
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return{ok:false};
 const [hours,minutes]=value.split(':').map(Number);return{ok:true,minutes:hours*60+minutes};
}
export function formatTimeOfDay(value:number|null):string{
 if(value===null)return'';
 if(!Number.isInteger(value)||value<0||value>1439)throw Error('Invalid minute of day');
 return`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
}
function valid(length:number,...positions:number[]){return positions.every(i=>Number.isInteger(i)&&i>=0&&i<length);}
export function moved<T>(items:T[],from:number,to:number):T[]{
 if(!valid(items.length,from,to)||from===to)return items;
 const next=[...items];const [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
export function moveDay(content:DraftContent,from:number,to:number):DraftContent{
 const days=moved(content.days,from,to);if(days===content.days)return content;
 const offsets=content.days.map(d=>d.offset).sort((a,b)=>a-b);
 return{days:days.map((d,i)=>({...d,offset:offsets[i]}))};
}
export function moveStop(content:DraftContent,day:number,from:number,to:number):DraftContent{
 if(!valid(content.days.length,day))return content;
 const stops=moved(content.days[day].stops,from,to);if(stops===content.days[day].stops)return content;
 return{days:content.days.map((d,i)=>i===day?{...d,stops}:d)};
}
export function removeStop(content:DraftContent,day:number,stop:number):DraftContent{
 if(!valid(content.days.length,day)||!valid(content.days[day].stops.length,stop))return content;
 return{days:content.days.map((d,i)=>i===day?{...d,stops:d.stops.filter((_,j)=>j!==stop)}:d)};
}
