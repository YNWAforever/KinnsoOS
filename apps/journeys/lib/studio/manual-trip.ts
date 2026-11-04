import type {GuestTrip} from '../trips/guest-drafts';
import {tripScheduleIssue} from '../trips/input-validation.ts';

export type ManualTripInput={title:string;timezone:string;startDate:string;days:{title:string;stops:string[]}[];note:string};
export type DeviceTripIdentity={id:string;ownerId:string};
function text(value:unknown,max:number,code:string,required=false):asserts value is string{
 if(typeof value!=='string'||value.length>max||value.includes('\0')||(required&&!value.trim()))throw Error(code);
}

/** Validate editable metadata without rebuilding stops or changing provenance. */
export function manualTripDetailsIssue(trip:GuestTrip):string|null{
 if(trip.origin!=='manual')return null;
 try{
  text(trip.title,200,'TITLE',true);
  const issue=tripScheduleIssue(trip.timezone,trip.startDate);if(issue)return issue.toUpperCase();
  if(!Array.isArray(trip.days)||trip.days.length<1||trip.days.length>30)return 'DAYS';
  for(const day of trip.days)text(day?.title,200,'DAY_TITLE',true);
  return null;
 }catch(error){return error instanceof Error?error.message:'INVALID';}
}

/** Own text only. No inferred places, schedule, source identity, or account write. */
export function prepareManualTripDraft(input:ManualTripInput,identity:DeviceTripIdentity):GuestTrip{
 if(!identity||typeof identity.id!=='string'||typeof identity.ownerId!=='string'||! /^[\w-]{1,100}$/.test(identity.id)||! /^guest-[\w-]{1,94}$/.test(identity.ownerId))throw Error('IDENTITY');
 text(input.title,200,'TITLE',true);text(input.note,4000,'NOTE');
 const issue=tripScheduleIssue(input.timezone,input.startDate);if(issue)throw Error(issue.toUpperCase());
 if(!Array.isArray(input.days)||input.days.length<1||input.days.length>30)throw Error('DAYS');
 let count=0;
 const days=input.days.map((day,offset)=>{
  if(!day||typeof day!=='object')throw Error('DAYS');
  text(day.title,200,'DAY_TITLE',true);
  if(!Array.isArray(day.stops)||day.stops.length<1||day.stops.length>20)throw Error('STOPS');
  count+=day.stops.length;if(count>200)throw Error('TOTAL_STOPS');
  const stops=day.stops.map(title=>{text(title,200,'STOPS',true);return{title:title.trim(),travellerNote:'',startMinuteOfDay:null,durationMinutes:null};});
  return{offset,title:day.title.trim(),stops};
 });
 days[0].stops[0].travellerNote=input.note;
 return{id:identity.id,ownerId:identity.ownerId,origin:'manual',purpose:'personal',title:input.title.trim(),timezone:input.timezone,startDate:input.startDate||null,pendingPhotos:[],days};
}
