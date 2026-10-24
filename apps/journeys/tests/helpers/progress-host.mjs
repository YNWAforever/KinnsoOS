// Synthetic HTTP/session/state boundaries only. No env, Supabase or DB access.
import {offlineTripHost,actorA,actorB} from './offline-trip-host.mjs';
export {actorA,actorB};
export const tripId='11111111-1111-4111-8111-111111111111';
export const dayId='22222222-2222-4222-8222-222222222222';
export const stops=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const placeId='66666666-6666-4666-8666-666666666666';
export function savedTrip(){
 return{id:tripId,title:'Synthetic progress trip',timezone:'Asia/Hong_Kong',startDate:'2026-10-19',
  destinationId:null,status:'planning',revision:7,media:[],days:[{id:dayId,offset:0,title:'Synthetic day',
   stops:stops.map((id,position)=>({id,position,title:['Museum','Harbour','Park'][position],
    placeId:position===1?null:placeId,travellerNote:'Original private note',
    startMinuteOfDay:540+position*60,durationMinutes:30,source:null}))}]};
}
export async function progressHost(){
 const host=await offlineTripHost();
 host.trips.set(tripId,{owner:actorA,value:savedTrip()});
 const records=new Map(),receipts=new Map(),calls=[],faults={before:false,after:false,read:false};
 const record=owner=>{
  const key=owner+':'+tripId;
  if(!records.has(key))records.set(key,{revision:0,entries:new Map()});
  return records.get(key);
 };
 const snapshot=owner=>{
  const row=record(owner),trip=host.trips.get(tripId).value,ids=new Set(trip.days.flatMap(day=>day.stops.map(stop=>stop.id)));
  return{ownerId:owner,tripId,tripRevision:trip.revision,progressRevision:row.revision,
   entries:[...row.entries].filter(([id])=>ids.has(id)).map(([stopId,state])=>({stopId,state}))};
 };
 async function connect(browser,locale,size,owner=actorA){
  const context=await browser.newContext({baseURL:host.origin,
   viewport:size==='mobile'?{width:390,height:844}:{width:1280,height:900},serviceWorkers:'block'});
  const external=[];
  await context.route('**/*',route=>{
   if(new URL(route.request().url()).origin===host.origin)return route.continue();
   external.push(route.request().url());return route.abort('blockedbyclient');
  });
  await context.route('**/api/trips/*/locations?*',async route=>{
   const trip=host.trips.get(tripId).value;
   await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,data:{
    tripId,dayId,revision:trip.revision,places:[{placeId,name:'Canonical museum',address:'Synthetic address',lat:22.3193,lng:114.1694}],
   }})});
  });
  await context.route('**/api/trips/*/progress',async route=>{
   const request=route.request(),headers=await request.allHeaders();
   const actor=headers.cookie?.match(/(?:^|;\s*)actor=([^;]+)/)?.[1]??null;
   const body=request.method()==='POST'?request.postDataJSON():null;
   calls.push({method:request.method(),actor,body:body?structuredClone(body):null});
   const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',
    headers:{'cache-control':'private, no-store'},body:JSON.stringify(value)});
   const fail=(code,status)=>send({ok:false,code,retryable:code==='UNAVAILABLE',requestId:'99999999-9999-4999-8999-999999999999'},status);
   if(!actor||headers['x-kinnso-intent-actor']&&headers['x-kinnso-intent-actor']!==actor)return fail('AUTH_REQUIRED',401);
   const trip=host.trips.get(tripId);
   if(!trip||trip.owner!==actor)return fail('NOT_FOUND',404);
   if(request.method()==='GET'){
    if(faults.read){faults.read=false;return route.abort('failed')}
    return send({ok:true,data:snapshot(actor)});
   }
   if(request.method()!=='POST')return fail('INVALID',400);
   if(faults.before){faults.before=false;return route.abort('failed')}
   const key=actor+':'+tripId+':'+body.requestId,prior=receipts.get(key),payload=JSON.stringify(body);
   if(prior){
    if(prior.payload!==payload)return fail('CONFLICT',409);
    return send({ok:true,data:{snapshot:snapshot(actor),requestId:body.requestId,
     appliedProgressRevision:prior.revision,replayed:true}});
   }
   const current=record(actor);
   if(body.expectedTripRevision!==trip.value.revision||body.expectedProgressRevision!==current.revision)
    return fail('CONFLICT',409);
   if(!trip.value.days.some(day=>day.stops.some(stop=>stop.id===body.stopId)))return fail('NOT_FOUND',404);
   if(!['pending','visited','skipped'].includes(body.state))return fail('INVALID',400);
   if((current.entries.get(body.stopId)??'pending')!==body.state){
    current.entries.set(body.stopId,body.state);current.revision++;
   }
   receipts.set(key,{payload,revision:current.revision});
   if(faults.after){faults.after=false;return route.abort('failed')}
   return send({ok:true,data:{snapshot:snapshot(actor),requestId:body.requestId,
    appliedProgressRevision:current.revision,replayed:false}});
  });
  await context.request.get('/__session?actor='+owner);
  const page=await context.newPage();
  await page.clock.install({time:new Date('2026-10-19T04:00:00Z')});
  await page.goto('/'+locale+'/trips/'+tripId+'#today');
  return{context,page,external,locale,size};
 }
 return{host,connect,calls,faults,snapshot,receipts,close:()=>host.close()};
}
