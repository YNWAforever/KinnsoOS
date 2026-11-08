import type {GuideSnapshot,GuideSummary,TripSnapshot,TripCommand,PublicTripProjection} from '../contracts/trips';
import type {ShareIntent,ShareReceipt} from '../contracts/share-receipts';
import type {StudioResponse} from './contracts';

export type TravellerTaskId='T1'|'T2'|'T3'|'T4'|'T5';
export type TravellerOperation=
 | {kind:'create';requestId:string;input:{title:string;timezone:string;startDate:string|null}}
 | {kind:'command';requestId:string;tripId:string;revision:number;command:TripCommand}
 | {kind:'adopt';requestId:string;tripId:string;revision:number;guideId:string;version:number;guide:GuideSnapshot}
 | {kind:'share';requestId:string;revision:number;intent:ShareIntent;projection:PublicTripProjection}
 | {kind:'bookmark';requestId:string;guideId:string;desiredState:boolean}
 | {kind:'photo';requestId:string;attachRequestId:string;tripId:string;revision:number;stopId:string};
export type TravellerBrief={
 id:string;ownerId:string;templateId:TravellerTaskId;visibility:'private';title:string;question:string;
 evidence:string[];notes:string;createdAt:string;operations:TravellerOperation[];
 tripId:string|null;tripRevision:number|null;guideId:string|null;guideVersion:number|null;
};
export type TravellerStore={
 list:()=>Promise<StudioResponse<{items:TravellerBrief[]}>>;
 get:(id:string)=>Promise<StudioResponse<TravellerBrief>>;
 stage:(brief:TravellerBrief)=>Promise<StudioResponse<TravellerBrief>>;
 intent:(id:string)=>Promise<StudioResponse<TravellerBrief>>;
 save:(brief:TravellerBrief)=>Promise<StudioResponse<TravellerBrief>>;
 samplePhoto:()=>Promise<Blob>;
 publicRead:(url:string)=>Promise<StudioResponse<PublicTripProjection>>;
};
export type TravellerOutcome={tripId?:string;share?:ShareReceipt;message:string};

/** Public allowlist. A private note is never used as an automatic description. */
export function travellerPublicProjection(trip:TripSnapshot,stopIds:string[],mediaIds:string[],ownerId:string):PublicTripProjection {
 const all=trip.days.flatMap(d=>d.stops);
 if(!stopIds.length||new Set(stopIds).size!==stopIds.length||stopIds.some(id=>!all.some(s=>s.id===id)))throw Error('請至少選一個仍可用的站點。');
 if(new Set(mediaIds).size!==mediaIds.length||mediaIds.some(id=>!trip.media.some(m=>m.id===id&&m.state==='ready'&&m.visibility==='private'&&m.ownerId===ownerId)))throw Error('相片尚未完成核實，或沒有權限。');
 return {title:trip.title,days:trip.days.map(d=>({id:d.id,offset:d.offset,title:d.title,stops:d.stops.filter(s=>stopIds.includes(s.id)).map(s=>({id:s.id,placeId:s.placeId,title:s.title,position:s.position,startMinuteOfDay:s.startMinuteOfDay,durationMinutes:s.durationMinutes,description:s.source?.withdrawn?'':s.sourceDescription??'',source:s.source?{guideId:s.source.guideId,guideVersion:s.source.guideVersion,creatorId:s.source.creatorId,creatorName:s.source.creatorName,canonicalUrl:s.source.canonicalUrl,withdrawn:s.source.withdrawn}:null}))})).filter(d=>d.stops.length),approvedMediaIds:[...mediaIds]};
}
export function travellerAdoptionEvidence(guide:GuideSnapshot|GuideSummary,trip:TripSnapshot) {
 if(guide.kind!=='itinerary'||!guide.days.length||!guide.days.some(d=>d.stops.length))throw Error('這份 guide 只有摘要，未有結構化站點，不能轉成行程。');
 return {guideId:guide.id,version:guide.version,creatorName:guide.creator.name,stops:guide.days.flatMap(d=>d.stops).length,days:guide.days.length,privateNotesKept:trip.days.flatMap(d=>d.stops).filter(s=>s.travellerNote).length,tripRevision:trip.revision};
}
/** Used only after a fresh canonical GET, never against the mutation toast/ACK. */
export function travellerCommandPresent(trip:TripSnapshot,command:TripCommand):boolean {
 const stop=trip.days.flatMap(d=>d.stops).find(s=>'id' in command&&s.id===command.id);
 switch(command.type){
  case 'patchTrip':return Object.entries(command.patch).every(([key,value])=>trip[key as keyof TripSnapshot]===value);
  case 'addDay':return trip.days.some(d=>d.id===command.id&&d.title===command.title&&d.offset===command.offset);
  case 'addStop':return trip.days.some(d=>d.id===command.dayId&&d.stops.some(s=>s.id===command.id&&Object.entries(command.input).every(([key,v])=>s[key as keyof typeof s]===v)));
  case 'updateStop':return !!stop&&Object.entries(command.patch).every(([key,v])=>stop[key as keyof typeof stop]===v);
  case 'attachMedia':return trip.media.some(m=>m.id===command.mediaId&&m.state==='ready'&&(m.stopId??null)===command.stopId);
  default:return false;
 }
}
