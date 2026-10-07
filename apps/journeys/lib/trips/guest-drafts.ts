import type {GuideSnapshot} from '../contracts/trips';
import {previewLocalImport} from './import.ts';
type DraftSource={guideId:string;version:number};
export type GuestTrip={id:string;ownerId:string;purpose:'personal';title:string;timezone:string;startDate:null;source?:DraftSource;days:{offset:number;title:string;stops:{title:string;travellerNote:string;startMinuteOfDay:number|null;durationMinutes:number|null;source:DraftSource}[]}[];pendingPhotos:[]};
export function guideDraft(guide:GuideSnapshot,id:string,ownerId:string,timezone:string):GuestTrip{return{id,ownerId,purpose:'personal',title:guide.title,timezone,startDate:null,source:{guideId:guide.id,version:guide.version},pendingPhotos:[],days:guide.days.map(day=>({offset:day.offset,title:day.title,stops:day.stops.map(stop=>({title:stop.title,travellerNote:'',startMinuteOfDay:stop.startMinuteOfDay,durationMinutes:stop.durationMinutes,source:{guideId:guide.id,version:guide.version}}))}))}}

// Device records are untrusted. A source tag identifies a local copy only;
// account import still removes these claims and verifies attribution on server.
export function restorableGuideDrafts(input:unknown,guideId:string):GuestTrip[]{
 if(!Array.isArray(input))return[];
 return input.flatMap(value=>{
  try{
   if(!value||typeof value!=='object')return[];
   const row=value as GuestTrip;
   if(typeof row.id!=='string'||! /^[\w-]{1,100}$/.test(row.id)||typeof row.ownerId!=='string'||! /^guest-[\w-]{1,94}$/.test(row.ownerId)||row.purpose!=='personal'||row.startDate!==null||!Array.isArray(row.pendingPhotos)||row.pendingPhotos.length)return[];
   const preview=previewLocalImport(row,row.ownerId);if(!preview.ok)return[];
   const source=(tag:DraftSource)=>{
    if(!tag||tag.guideId!==guideId||!Number.isSafeInteger(tag.version)||tag.version<1)throw new Error('source');
    return{guideId,version:tag.version};
   };
   const root=row.source===undefined?undefined:source(row.source);
   const versions=new Set<number>(root?[root.version]:[]);
   const days=preview.payload.days.map((day,i)=>({...day,stops:day.stops.map((stop,j)=>{
    const tag=source(row.days[i].stops[j].source);versions.add(tag.version);
    return{...stop,source:tag};
   })}));
   if(versions.size!==1)return[];
   return[{id:row.id,ownerId:row.ownerId,purpose:'personal' as const,title:preview.payload.title,timezone:preview.payload.timezone,startDate:null,source:root??{guideId,version:[...versions][0]},days,pendingPhotos:[] as []}];
  }catch{return[]}
 });
}
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('kinnso_guest_drafts_v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('trips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Device draft storage is unavailable. Keep this tab open.'))})}
export async function saveGuestTrip(trip:GuestTrip){const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('trips','readwrite');tx.objectStore('trips').put(trip);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
export async function readGuestTrips():Promise<GuestTrip[]>{const db=await open();try{return await new Promise((resolve,reject)=>{const request=db.transaction('trips').objectStore('trips').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{db.close()}}
