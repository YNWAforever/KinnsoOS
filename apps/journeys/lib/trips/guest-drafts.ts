import type {GuideSnapshot} from '../contracts/trips';
type DraftSource={guideId:string;version:number};
export type GuestTrip={id:string;ownerId:string;purpose:'personal';title:string;timezone:string;startDate:null;source?:DraftSource;days:{offset:number;title:string;stops:{title:string;travellerNote:string;startMinuteOfDay:number|null;durationMinutes:number|null;source:DraftSource}[]}[];pendingPhotos:[]};
export function guideDraft(guide:GuideSnapshot,id:string,ownerId:string,timezone:string):GuestTrip{return{id,ownerId,purpose:'personal',title:guide.title,timezone,startDate:null,source:{guideId:guide.id,version:guide.version},pendingPhotos:[],days:guide.days.map(day=>({offset:day.offset,title:day.title,stops:day.stops.map(stop=>({title:stop.title,travellerNote:'',startMinuteOfDay:stop.startMinuteOfDay,durationMinutes:stop.durationMinutes,source:{guideId:guide.id,version:guide.version}}))}))}}

// Device records are untrusted. A source tag identifies a local copy only;
// account import still removes these claims and verifies attribution on server.
export function restorableDeviceDrafts(input:unknown):GuestTrip[]{
 if(!Array.isArray(input))return[];
 return input.flatMap(value=>{
  try{
   if(!value||typeof value!=='object')return[];
   const row=value as GuestTrip;
   // Up to 200 notes of 4,000 characters (including Unicode) may exceed the
   // account import limit. Bound device records separately, including extras.
   if(new TextEncoder().encode(JSON.stringify(row)).length>4*1024*1024)return[];
   if(typeof row.id!=='string'||! /^[\w-]{1,100}$/.test(row.id)||typeof row.ownerId!=='string'||! /^guest-[\w-]{1,94}$/.test(row.ownerId)||row.purpose!=='personal'||row.startDate!==null||!Array.isArray(row.pendingPhotos)||row.pendingPhotos.length)return[];
   const text=(value:unknown,max:number,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Error('text');return value;};
   if(!Array.isArray(row.days)||row.days.length<1||row.days.length>30)return[];
   const source=(tag:DraftSource)=>{
    if(!tag||typeof tag.guideId!=='string'||! /^[\w-]{1,100}$/.test(tag.guideId)||!Number.isSafeInteger(tag.version)||tag.version<1)throw new Error('source');
    return{guideId:tag.guideId,version:tag.version};
   };
   let root=row.source===undefined?undefined:source(row.source),count=0;
   const days=row.days.map(day=>{
    if(!day||!Number.isInteger(day.offset)||day.offset<0||day.offset>364||!Array.isArray(day.stops)||day.stops.length>50)throw new Error('day');
    return{offset:day.offset,title:text(day.title,200),stops:day.stops.map(stop=>{
     if(!stop||++count>200)throw new Error('stop');
     const tag=source(stop.source);root??=tag;
     if(tag.guideId!==root.guideId||tag.version!==root.version)throw new Error('mixed_source');
     const start=stop.startMinuteOfDay,duration=stop.durationMinutes;
     if(start!==null&&(!Number.isInteger(start)||start<0||start>1439)||duration!==null&&(!Number.isInteger(duration)||duration<1||duration>1440))throw new Error('time');
     return{title:text(stop.title,200),travellerNote:text(stop.travellerNote,4000),startMinuteOfDay:start,durationMinutes:duration,source:tag};
    })};
   });
   if(!root)return[];
   return[{id:row.id,ownerId:row.ownerId,purpose:'personal' as const,title:text(row.title,200,true),timezone:text(row.timezone,80,true),startDate:null,source:root,days,pendingPhotos:[] as []}];
  }catch{return[]}
 });
}
export function restorableGuideDrafts(input:unknown,guideId:string):GuestTrip[]{return restorableDeviceDrafts(input).filter(row=>row.source?.guideId===guideId);}
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('kinnso_guest_drafts_v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('trips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Device draft storage is unavailable. Keep this tab open.'))})}
export async function saveGuestTrip(trip:GuestTrip){const recoverable=restorableDeviceDrafts([trip])[0];if(!recoverable)throw new Error('Device draft is outside the supported editor limits. Original copy is kept.');const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('trips','readwrite');tx.objectStore('trips').put(recoverable);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
export async function readGuestTrips():Promise<GuestTrip[]>{const db=await open();try{return await new Promise((resolve,reject)=>{const request=db.transaction('trips').objectStore('trips').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{db.close()}}
