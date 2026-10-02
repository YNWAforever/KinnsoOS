type RecordValue=Record<string,unknown>;
const record=(value:unknown):RecordValue=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID');return value as RecordValue};
const text=(value:unknown,max:number,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Error('INVALID');return value};
const localized=(value:unknown)=>typeof value==='string'?value:record(value).en;
export type ImportPayload={title:string;timezone:string;startDate:string|null;days:{offset:number;title:string;stops:{title:string;travellerNote:string;startMinuteOfDay:number|null;durationMinutes:number|null}[]}[];pendingPhotos:{name:string;mime:string|null;size:number|null}[]};
export type ImportPreview={ok:true;localOwnerId:string;sourceId:string;payload:ImportPayload;unverifiedSources:number}|{ok:false;reason:string};
export function previewLocalImport(input:unknown,selectedLocalOwner:string):ImportPreview {
 try{
  if(new TextEncoder().encode(JSON.stringify(input)).length>262144)throw new Error('too_large');
  const r=record(input),owner=r.ownerId??r.owner;
  if(owner!==selectedLocalOwner||!selectedLocalOwner||r.purpose&&r.purpose!=='personal')throw new Error('owner_scope');
  if(!Array.isArray(r.days)||r.days.length<1||r.days.length>30)throw new Error('days');
  let count=0,unverifiedSources=0;
  const days=r.days.map((value,index)=>{const day=record(value);if(!Array.isArray(day.stops)||day.stops.length>50)throw new Error('stops');
   const offset=day.offset??index;if(!Number.isInteger(offset)||Number(offset)<0||Number(offset)>364)throw new Error('offset');
   return{offset:Number(offset),title:text(localized(day.title??day.name??''),200),stops:day.stops.map(value=>{const stop=record(value);if(++count>200)throw new Error('stops');if(stop.source||stop.origin)unverifiedSources++;
    const start=stop.startMinuteOfDay??null,duration=stop.durationMinutes??null;
    if(start!==null&&(!Number.isInteger(start)||Number(start)<0||Number(start)>1439)||duration!==null&&(!Number.isInteger(duration)||Number(duration)<1||Number(duration)>1440))throw new Error('time');
    return{title:text(localized(stop.title??stop.name),200,true),travellerNote:text(stop.travellerNote??stop.personalNote??'',4000),startMinuteOfDay:start as number|null,durationMinutes:duration as number|null};})};});
  const photos=r.pendingPhotos??(Array.isArray(r.media)?r.media.map((value,index)=>{const m=record(value);return{name:m.name??`local-photo-${index+1}`,mime:null,size:null}}):[]);
  if(!Array.isArray(photos)||photos.length>20)throw new Error('media');
  const pendingPhotos=photos.map(value=>{const p=record(value);if(p.mime===null&&p.size===null)return{name:text(p.name,255,true),mime:null,size:null};const mime=text(p.mime,40),size=Number(p.size);if(!['image/jpeg','image/png','image/webp'].includes(mime)||!Number.isInteger(size)||size<1||size>10485760)throw new Error('media');return{name:text(p.name,255,true),mime,size}});
  const startDate=r.startDate??r.date??null;if(startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate)))throw new Error('date');
  const id=typeof r.id==='string'&&/^[\w-]{1,100}$/.test(r.id)?r.id:'manual';
  return{ok:true,localOwnerId:selectedLocalOwner,sourceId:`local:${selectedLocalOwner}:${id}`,unverifiedSources,payload:{title:text(r.title,200,true),timezone:text(r.timezone??'UTC',80,true),startDate:startDate?String(startDate):null,days,pendingPhotos}};
 }catch(error){return{ok:false,reason:error instanceof Error?error.message:'INVALID'}}
}
