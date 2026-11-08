import type {GuestTrip} from './guest-drafts.ts';
import {formatTimeOfDay,parseTimeOfDay} from '../creators/editor-operations.ts';

type Stop=GuestTrip['days'][number]['stops'][number];
export type StopScheduleInput={startTime:string;duration:string};
type EditStop=Stop&{editorKey:string;scheduleInput?:StopScheduleInput};
type EditDay=Omit<GuestTrip['days'][number],'stops'>&{editorKey:string;stops:EditStop[]};
export type GuestTripEdit=Omit<GuestTrip,'days'>&{days:EditDay[]};
export type ManualTripStructureCommand=
 |{type:'addDay';title:string}
 |{type:'moveDay';dayKey:string;direction:-1|1}
 |{type:'removeDay';dayKey:string}
 |{type:'addStop';dayKey:string}
 |{type:'moveStop';dayKey:string;stopKey:string;direction:-1|1}
 |{type:'transferStop';dayKey:string;stopKey:string;targetDayKey:string}
 |{type:'removeStop';dayKey:string;stopKey:string};
type KeyFactory=()=>string;

/** Transient view identities are deliberately separate from saved identities. */
export function beginGuestTripEdit(trip:GuestTrip,key:KeyFactory=()=>crypto.randomUUID()):GuestTripEdit{
 const copy=structuredClone(trip);
 return{...copy,days:copy.days.map(day=>({...day,editorKey:key(),stops:day.stops.map(stop=>({...stop,editorKey:key()}))}))};
}

/** Strip view identities; the existing writer still validates storage limits. */
export function guestTripEditSnapshot(edit:GuestTrip|GuestTripEdit):GuestTrip{
 return{...edit,days:edit.days.map(value=>{
  const{editorKey:_dayKey,...day}=value as EditDay;
  return{...day,stops:day.stops.map(value=>{const{editorKey:_stopKey,scheduleInput:_input,...stop}=value as EditStop;return stop;})};
 })};
}

export function stopScheduleInput(stop:Stop&{scheduleInput?:StopScheduleInput}):StopScheduleInput{
 return stop.scheduleInput??{startTime:formatTimeOfDay(stop.startMinuteOfDay),duration:stop.durationMinutes===null?'':String(stop.durationMinutes)};
}
function parseSchedule(input:StopScheduleInput){
 const start=parseTimeOfDay(input.startTime);
 if(!start.ok)return{ok:false,issue:'STOP_TIME'} as const;
 const duration=input.duration===''?null:Number(input.duration);
 if(duration!==null&&(!/^\d+$/.test(input.duration)||!Number.isInteger(duration)||duration<1||duration>1440))return{ok:false,issue:'STOP_DURATION'} as const;
 return{ok:true,startMinuteOfDay:start.minutes,durationMinutes:duration} as const;
}
export function stopScheduleIssue(stop:Stop&{scheduleInput?:StopScheduleInput}):'STOP_TIME'|'STOP_DURATION'|null{
 if(!stop.scheduleInput)return null;
 const parsed=parseSchedule(stop.scheduleInput);return parsed.ok?null:parsed.issue;
}
export function manualTripStopScheduleIssue(edit:GuestTripEdit):'STOP_TIME'|'STOP_DURATION'|null{
 if(edit.origin!=='manual')return null;
 for(const day of edit.days)for(const stop of day.stops){const issue=stopScheduleIssue(stop);if(issue)return issue;}
 return null;
}
/** Raw partial input follows the keyed stop, but only valid times become data. */
export function changeManualStopSchedule(edit:GuestTripEdit,stopKey:string,field:keyof StopScheduleInput,value:string):GuestTripEdit{
 if(edit.origin!=='manual')throw Error('MANUAL_ONLY');
 if(field!=='startTime'&&field!=='duration')throw Error('INVALID');
 const index=edit.days.findIndex(day=>day.stops.some(stop=>stop.editorKey===stopKey));
 if(index<0)return edit;
 const day=edit.days[index],stop=day.stops.find(stop=>stop.editorKey===stopKey)!;
 const input=stopScheduleInput(stop);if(input[field]===value)return edit;
 const scheduleInput={...input,[field]:value},parsed=parseSchedule(scheduleInput);
 const updated={...stop,scheduleInput,...parsed.ok?{startMinuteOfDay:parsed.startMinuteOfDay,durationMinutes:parsed.durationMinutes}:{}};
 return{...edit,days:edit.days.map((day,i)=>i===index?{...day,stops:day.stops.map(stop=>stop.editorKey===stopKey?updated:stop)}:day)};
}

export function changeManualTripStructure(edit:GuestTripEdit,command:ManualTripStructureCommand,key:KeyFactory=()=>crypto.randomUUID()):GuestTripEdit{
 if(edit.origin!=='manual')throw Error('MANUAL_ONLY');
 const renumber=(days:EditDay[])=>({...edit,days:days.map((day,offset)=>({...day,offset}))});
 if(command.type==='addDay'){
  if(edit.days.length>=30)throw Error('DAY_LIMIT');
  if(typeof command.title!=='string'||!command.title.trim()||command.title.length>200||command.title.includes('\0'))throw Error('DAY_TITLE');
  return renumber([...edit.days,{editorKey:key(),offset:edit.days.length,title:command.title,stops:[]}]);
 }
 const index=edit.days.findIndex(day=>day.editorKey===command.dayKey);
 if(index<0)return edit;
 const day=edit.days[index];
 if(command.type==='removeDay'){
  if(edit.days.length===1)throw Error('LAST_DAY');
  return renumber(edit.days.filter(value=>value.editorKey!==command.dayKey));
 }
 if(command.type==='moveDay'){
  if(command.direction!==-1&&command.direction!==1)throw Error('INVALID');
  const target=index+command.direction;if(target<0||target>=edit.days.length)return edit;
  const days=[...edit.days];[days[index],days[target]]=[days[target],days[index]];return renumber(days);
 }
 if(command.type==='transferStop'){
  const position=day.stops.findIndex(stop=>stop.editorKey===command.stopKey);
  const destination=edit.days.findIndex(day=>day.editorKey===command.targetDayKey);
  if(position<0||destination<0||destination===index)return edit;
  if(edit.days[destination].stops.length>=50)throw Error('STOP_LIMIT');
  const moving=day.stops[position];
  return{...edit,days:edit.days.map((value,i)=>i===index?{...value,stops:value.stops.filter(stop=>stop.editorKey!==command.stopKey)}:i===destination?{...value,stops:[...value.stops,moving]}:value)};
 }
 let stops:EditStop[];
 if(command.type==='addStop'){
  if(day.stops.length>=50||edit.days.reduce((count,value)=>count+value.stops.length,0)>=200)throw Error('STOP_LIMIT');
  stops=[...day.stops,{editorKey:key(),title:'',travellerNote:'',startMinuteOfDay:null,durationMinutes:null}];
 }else{
  const position=day.stops.findIndex(stop=>stop.editorKey===command.stopKey);if(position<0)return edit;
  if(command.type==='removeStop')stops=day.stops.filter(stop=>stop.editorKey!==command.stopKey);
  else if(command.type==='moveStop'){
   if(command.direction!==-1&&command.direction!==1)throw Error('INVALID');
   const target=position+command.direction;if(target<0||target>=day.stops.length)return edit;
   stops=[...day.stops];[stops[position],stops[target]]=[stops[target],stops[position]];
  }else throw Error('INVALID');
 }
 return{...edit,days:edit.days.map((value,i)=>i===index?{...day,stops}:value)};
}
