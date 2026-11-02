// Session-isolated examples. This file is never imported by a product server.
import {randomUUID,createHash} from 'node:crypto';
import {travellerPublicProjection} from '../../../apps/journeys/lib/studio/traveller-tasks.ts';
import {commandEnvelope,uuid} from '../../../apps/journeys/lib/api/validation.ts';
import {tripScheduleIssue} from '../../../apps/journeys/lib/trips/input-validation.ts';
export const SAMPLE_PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=','base64');
export const SAMPLE_HASH=createHash('sha256').update(SAMPLE_PNG).digest('hex');
export const TRAVELLER_IDS={trip:'71000000-0000-4000-8000-000000000001',guide:'72000000-0000-4000-8000-000000000001',summary:'72000000-0000-4000-8000-000000000002',day:'73000000-0000-4000-8000-000000000001',stop:'74000000-0000-4000-8000-000000000001'};
const clone=v=>structuredClone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ok=data=>({status:200,body:{ok:true,data:clone(data)}});
const fail=(code,status=409)=>({status,body:{ok:false,code,retryable:code==='UNAVAILABLE'}});
export function travellerExamples(actor,origin,publicShares){
 let discovery=null;
 const ids=TRAVELLER_IDS;
 const guides=new Map([[ids.guide,{kind:'itinerary',id:ids.guide,version:1,title:'海旁慢遊｜原創示例 guide',destinationId:null,publishedAt:'2026-10-31T00:00:00.000Z',creator:{id:actor,name:'Kinnso 示例作者',handle:'example'},days:[{id:randomUUID(),offset:0,title:'海旁慢走',stops:[{id:randomUUID(),placeId:null,title:'海旁散步（示例）',position:0,description:'自有示例：沿海旁慢步。開放時間、交通及費用未驗證。',startMinuteOfDay:600,durationMinutes:45,source:null},{id:randomUUID(),placeId:null,title:'休息小站（示例）',position:1,description:'自有示例：留時間休息。並非真實商戶推薦。',startMinuteOfDay:660,durationMinutes:30,source:null}]}]}],[ids.summary,{kind:'summary',id:ids.summary,title:'城市靈感｜只有摘要的示例',destinationId:null,summary:'只有文字靈感，沒有可採用的結構化站點。'}]]);
 const trips=new Map([[ids.trip,{id:ids.trip,title:'我的香港慢遊（示例）',destinationId:null,timezone:'Asia/Hong_Kong',startDate:'2026-11-07',status:'planning',revision:1,days:[{id:ids.day,offset:0,title:'自己的第一天',stops:[{id:ids.stop,placeId:null,title:'自己的集合點（示例）',position:0,travellerNote:'PRIVATE_TRAVELLER_NOTE：這是只給自己看的示例備忘。',startMinuteOfDay:540,durationMinutes:20,source:null}]}],media:[]}]]);
 const saved=new Set([ids.guide,ids.summary]),briefs=new Map(),intents=new Map(),receipts=new Map(),shares=new Map(),media=new Map(),withdrawn=new Set();
 const projectReply=result=>result?.body?.ok&&result.body.data?.days&&trips.has(result.body.data.id)&&discovery?ok(discovery.projectTrip(result.body.data)):result;
 const remembered=(key,input,write)=>{const prior=receipts.get(key);if(prior)return same(prior.input,input)?projectReply(ok(prior.data)):fail('CONFLICT');const result=write();if(result.body.ok)receipts.set(key,{input:clone(input),data:clone(result.body.data)});return projectReply(result);};
 const readable=b=>{
  if(!(b?.ownerId===actor&&(!b.tripId||trips.has(b.tripId))&&(!b.guideId||guides.has(b.guideId)&&!withdrawn.has(b.guideId))))return false;
  try{for(const op of b.operations??[]){if(op.kind==='adopt')discovery?.assertAdoptable(op.guide??guides.get(op.guideId),{requireFresh:false});if(op.kind==='share')discovery?.assertShareable(op.intent?.stopIds??[],{requireFresh:false,days:op.projection?.days??[]});}}catch{return false;}
  return true;
 };
 const shareState=s=>s.state==='revoked'?'revoked':Date.parse(s.expiresAt)<=Date.now()?'expired':'active';
 const receipt=s=>({...clone(s),projection:s.readProjection?s.readProjection()??{title:'來源受限',days:[],approvedMediaIds:[]}:clone(s.projection),state:shareState(s),url:shareState(s)==='active'?s.url:null});
 function command(trip,c){
  const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
  const day=trip.days.find(d=>d.id===c.id),all=trip.days.flatMap(d=>d.stops),stop=all.find(s=>s.id===c.id);
  switch(c.type){
   case 'patchTrip':if(c.patch.title!==undefined&&!text(c.patch.title)||tripScheduleIssue(c.patch.timezone??trip.timezone,c.patch.startDate===undefined?trip.startDate:c.patch.startDate))throw Error();Object.assign(trip,c.patch);break;
   case 'addDay':if(!uuid(c.id)||!text(c.title)||!Number.isInteger(c.offset)||c.offset<0||trip.days.some(d=>d.id===c.id))throw Error();trip.days.push({id:c.id,offset:c.offset,title:c.title,stops:[]});break;
   case 'updateDay':if(!day||c.patch.title!==undefined&&!text(c.patch.title)||c.patch.offset!==undefined&&(!Number.isInteger(c.patch.offset)||c.patch.offset<0))throw Error();Object.assign(day,c.patch);break;
   case 'removeDay':if(!day)throw Error();trip.days=trip.days.filter(d=>d.id!==c.id);break;
   case 'addStop':{const target=trip.days.find(d=>d.id===c.dayId);if(!target||!uuid(c.id)||!text(c.input.title)||all.some(s=>s.id===c.id)||!Number.isInteger(c.position)||c.position<0||c.position>target.stops.length)throw Error();target.stops.splice(c.position,0,{id:c.id,...clone(c.input),position:c.position,source:null});break;}
   case 'updateStop':if(!stop||c.patch.title!==undefined&&!text(c.patch.title)||c.patch.travellerNote!==undefined&&(typeof c.patch.travellerNote!=='string'||c.patch.travellerNote.length>4000))throw Error();Object.assign(stop,c.patch);break;
   case 'removeStop':if(!stop)throw Error();trip.days.forEach(d=>d.stops=d.stops.filter(s=>s.id!==c.id));break;
   case 'moveStop':{const target=trip.days.find(d=>d.id===c.dayId);if(!stop||!target||!Number.isInteger(c.position)||c.position<0||c.position>target.stops.length)throw Error();trip.days.forEach(d=>d.stops=d.stops.filter(s=>s.id!==c.id));target.stops.splice(c.position,0,stop);break;}
   case 'attachMedia':{const m=media.get(c.mediaId);if(!m||m.tripId!==trip.id||m.ownerId!==actor||m.state!=='ready'||c.stopId!==null&&!all.some(s=>s.id===c.stopId))throw Error();if(!trip.media.some(x=>x.id===m.id))trip.media.push({id:m.id,state:'ready',ownerId:actor,visibility:'private',stopId:c.stopId});break;}
   case 'detachMedia':trip.media=trip.media.filter(m=>m.id!==c.mediaId);break;
   case 'overrideWarning':if(!stop||!c.reason?.trim())throw Error();trip.overrides=[...(trip.overrides??[]),{stopId:c.id,code:c.code,reason:c.reason}];break;
   default:throw Error();
  }
  for(const d of trip.days)for(const [i,s] of d.stops.entries()){s.position=i;if(s.startMinuteOfDay!==null&&(!Number.isInteger(s.startMinuteOfDay)||s.startMinuteOfDay<0||s.startMinuteOfDay>1439)||s.durationMinutes!==null&&(!Number.isInteger(s.durationMinutes)||s.durationMinutes<1||s.durationMinutes>1440))throw Error();}
 }
 function handle(method,path,body,q){
  if(path==='/__preview/traveller/briefs'||path==='/__preview/traveller/intents'){
   if(method==='GET')return ok({items:[...briefs.values()].filter(readable)});
   if(method!=='POST'||!uuid(body?.id)||!readable(body)||body.visibility!=='private'||!/^T[1-5]$/.test(body.templateId)||!Array.isArray(body.operations)||body.operations.length>12)return fail('INVALID',400);
   const collection=path.endsWith('/intents')?intents:briefs;
   const existing=collection.get(body.id);if(existing)return same(existing,body)?ok(existing):fail('CONFLICT');
   if(body.tripId&&trips.get(body.tripId)?.revision!==body.tripRevision||body.guideVersion!==null&&guides.get(body.guideId)?.version!==body.guideVersion)return fail('CONFLICT');
   if(body.operations.some(o=>!uuid(o.requestId)||o.tripId&&o.tripId!=='created'&&!trips.has(o.tripId)||o.guideId&&(!guides.has(o.guideId)||withdrawn.has(o.guideId)&&!(o.kind==='bookmark'&&o.desiredState===false))))return fail('INVALID',400);
   if(collection===briefs&&!same(intents.get(body.id),body))return fail('INVALID',400);
   collection.set(body.id,clone(body));return ok(body);
  }
  if(path.startsWith('/__preview/traveller/intents/')&&method==='GET'){const b=intents.get(path.split('/').at(-1));return !b?fail('NOT_FOUND',404):readable(b)?ok(b):fail('RESTRICTED',403);}
  if(path.startsWith('/__preview/traveller/briefs/')&&method==='GET'){const b=briefs.get(path.split('/').at(-1));return !b?fail('NOT_FOUND',404):readable(b)?ok(b):fail('RESTRICTED',403);}
  if(path==='/__preview/traveller/catalogue'&&method==='GET')return ok({items:[...guides.values()].filter(g=>!withdrawn.has(g.id)).map(g=>g.kind==='itinerary'&&discovery?discovery.projectGuide(g):g).filter(Boolean)});
  // Explicit fixture controls used by negative tests, not a product capability.
  if(path==='/__preview/traveller/withdraw'&&method==='POST'){if(!guides.has(body?.guideId))return fail('NOT_FOUND',404);withdrawn.add(body.guideId);for(const t of trips.values())for(const s of t.days.flatMap(d=>d.stops))if(s.source?.guideId===body.guideId)s.source.withdrawn=true;return ok({withdrawn:true});}
  if(path==='/__preview/traveller/advance-guide'&&method==='POST'){const g=guides.get(ids.guide);g.version++;g.days[0].stops[0].description='新版示例描述';return ok(g);}
  if(path==='/api/session'&&method==='GET')return ok({id:actor,roles:['traveller','creator']});
  if(path.startsWith('/api/guides/')&&method==='GET'){const id=path.split('/').at(-1);if(!guides.has(id))return null;const raw=guides.get(id),value=raw.kind==='itinerary'&&discovery?discovery.projectGuide(raw):raw;return withdrawn.has(id)?fail('NOT_FOUND',404):value?ok(value):fail('RESTRICTED',403);}
  if(path==='/api/bookmarks'){
   if(method==='GET'){const rows=[...saved].filter(id=>!q.get('guideId')||q.get('guideId')===id).map(id=>({guide_id:id,guides:withdrawn.has(id)?null:{id,slug:id,title:guides.get(id).title}}));return {status:200,body:{ok:true,data:rows,nextCursor:null}};}
   if(method!=='POST'||!uuid(body?.requestId)||typeof body.desiredState!=='boolean'||!guides.has(body.guideId))return fail('INVALID',400);
   return remembered('bookmark:'+body.requestId,body,()=>{if(body.desiredState&&withdrawn.has(body.guideId))return fail('NOT_FOUND',404);body.desiredState?saved.add(body.guideId):saved.delete(body.guideId);return ok({saved:body.desiredState});});
  }
  if(path==='/api/trips/creation'&&method==='GET')return ok({tripId:receipts.get('create:'+q.get('requestId'))?.data.id??null});
  if(path==='/api/trips'){
   if(method==='GET')return ok({items:[...trips.values()].map(({id,title,revision})=>({id,title,revision})),nextCursor:null});
   if(method!=='POST'||!uuid(body?.requestId)||typeof body.input?.title!=='string'||!body.input.title.trim()||body.input.title.length>200||tripScheduleIssue(body.input.timezone,body.input.startDate))return fail('INVALID',400);
   return remembered('create:'+body.requestId,body,()=>{const trip={id:randomUUID(),...body.input,destinationId:null,status:'planning',revision:1,days:[],media:[]};trips.set(trip.id,trip);return ok(trip);});
  }
  if(path.startsWith('/api/trips/')){
   const [, , ,id,action]=path.split('/'),trip=trips.get(id);
   if(method==='DELETE'&&!action&&uuid(body?.requestId)&&receipts.has('trip:'+id+':'+body.requestId))return remembered('trip:'+id+':'+body.requestId,body,()=>fail('NOT_FOUND',404));
   if(!trip)return fail('NOT_FOUND',404);
   if(method==='GET'&&!action)return ok(discovery?discovery.projectTrip(trip):trip);
   if(!uuid(body?.requestId)||!Number.isInteger(body.expectedRevision))return fail('INVALID',400);
   return remembered('trip:'+id+':'+body.requestId,body,()=>{
    if(trip.revision!==body.expectedRevision)return fail('CONFLICT');
    const next=clone(trip);let derivativeBindings=[];
    if(method==='DELETE'&&!action){trips.delete(id);for(const s of shares.values())if(s.intent.tripId===id)s.state='revoked';return ok({deleted:true});}
    if(method!=='POST')return fail('INVALID',400);
    if(action==='commands'){try{commandEnvelope(body);command(next,body.command);}catch{return fail('INVALID',400);}}
    else if(action==='adopt'){
     const guide=guides.get(body.guideId);if(!guide||withdrawn.has(guide.id))return fail('NOT_FOUND',404);if(guide.kind!=='itinerary')return fail('INVALID',400);if(guide.version!==body.version)return fail('CONFLICT');
     try{discovery?.assertAdoptable(guide);}catch{return fail('RESTRICTED',403);}
     const offset=next.days.length?Math.max(...next.days.map(d=>d.offset))+1:0;
     const added=guide.days.map(d=>({id:randomUUID(),offset:d.offset+offset,title:d.title,stops:d.stops.map(s=>({id:randomUUID(),placeId:s.placeId,title:s.title,position:s.position,startMinuteOfDay:s.startMinuteOfDay,durationMinutes:s.durationMinutes,travellerNote:'',sourceDescription:s.description,source:{guideId:guide.id,guideVersion:guide.version,creatorId:guide.creator.id,creatorName:guide.creator.name,canonicalUrl:origin+'/zh-HK/g/'+guide.id,withdrawn:false}}))}));
     try{derivativeBindings=discovery?.prepareAdoption(guide,added,next.revision+1)??[];}catch{return fail('RESTRICTED',403);}next.days.push(...added);
    }else return fail('UNAVAILABLE',503);
    discovery?.install(derivativeBindings);next.revision++;trips.set(id,next);return ok(next);
   });
  }
  if(path==='/api/media'&&method==='POST'){
   if(!uuid(body?.requestId)||!trips.has(body.tripId)||body.mime!=='image/png'||body.size!==SAMPLE_PNG.length)return fail('INVALID',400);
   return remembered('photo:'+body.requestId,body,()=>{const id=randomUUID();media.set(id,{id,tripId:body.tripId,ownerId:actor,visibility:'private',state:'pending'});return ok({id,uploadUrl:null,alreadyUploaded:true});});
  }
  if(path==='/api/media/finalize'&&method==='POST'){const m=media.get(body?.id);if(!m||!trips.has(m.tripId))return fail('NOT_FOUND',404);if(body.checksum!==SAMPLE_HASH)return fail('INVALID',400);m.state='ready';return ok({id:m.id,ownerId:actor,visibility:'private',state:m.state});}
  if(path.startsWith('/api/media/')&&method==='GET'){const m=media.get(path.split('/').at(-1));return m?.state==='ready'&&trips.has(m.tripId)?{status:200,binary:SAMPLE_PNG}:fail('NOT_FOUND',404);}
  if(path==='/api/shares/receipts'&&method==='GET'){
   if(!trips.has(q.get('tripId')))return fail('NOT_FOUND',404);
   if(q.has('requestId')){const s=[...shares.values()].find(s=>s.requestId===q.get('requestId')&&s.intent.tripId===q.get('tripId'));return ok(s?receipt(s):null);}
   return ok({items:[...shares.values()].filter(s=>s.intent.tripId===q.get('tripId')).map(s=>({requestId:s.requestId,id:s.id,createdAt:s.createdAt,expiresAt:s.expiresAt,state:shareState(s)})),nextCursor:null});
  }
  if(path==='/api/shares'){
   if(method==='GET'){if(!trips.has(q.get('tripId')))return fail('NOT_FOUND',404);return ok([...shares.values()].filter(s=>s.intent.tripId===q.get('tripId')&&shareState(s)==='active').map(({id,createdAt,expiresAt})=>({id,createdAt,expiresAt})));}
   if(method!=='POST'||!uuid(body?.requestId)||!trips.has(body.tripId)||!Array.isArray(body.stopIds)||!Array.isArray(body.mediaIds)||!Number.isFinite(Date.parse(body.expiresAt)))return fail('INVALID',400);
   const previous=[...shares.values()].find(s=>s.requestId===body.requestId);if(previous)return same(previous.intent,body)?ok(receipt(previous)):fail('CONFLICT');
   const trip=trips.get(body.tripId),op=[...briefs.values()].flatMap(b=>b.operations).find(o=>o.kind==='share'&&o.requestId===body.requestId);
   if(op&&(trip.revision!==op.revision||!same(op.intent,body)))return fail('CONFLICT');
   try{discovery?.assertShareable(body.stopIds,{days:trip.days});}catch{return fail('RESTRICTED',403);}
   let projection;try{projection=travellerPublicProjection(trip,body.stopIds,body.mediaIds,actor);}catch{return fail('INVALID',400);}
   if(op&&!same(op.projection,projection))return fail('CONFLICT');
   if(Date.parse(body.expiresAt)<=Date.now()||Date.parse(body.expiresAt)>Date.now()+7*86400000)return fail('INVALID',400);
   const id=randomUUID(),token=randomUUID(),s={id,requestId:body.requestId,createdAt:new Date().toISOString(),expiresAt:body.expiresAt,state:'active',intent:clone(body),projection,url:origin+'/zh-HK/s/'+token};
   if(discovery){let bindings;try{bindings=discovery.prepareShare(id,projection);}catch{return fail('RESTRICTED',403);}discovery.install(bindings);Object.defineProperty(s,'readProjection',{value:()=>discovery.projectShare(id,projection)});}
   shares.set(id,s);publicShares.set(token,s);return ok(receipt(s));
  }
  if(path.startsWith('/api/shares/')&&method==='DELETE'){const s=shares.get(path.split('/').at(-1));if(!s)return fail('NOT_FOUND',404);s.state='revoked';return ok({revoked:true});}
  return null;
 }
 return {handle,useDiscovery:value=>{discovery=value;},registerGuide:guide=>{guides.set(guide.id,clone(guide));},dispose:()=>{for(const s of shares.values())s.state='revoked';}};
}
