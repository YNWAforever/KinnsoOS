import test from 'node:test';
import assert from 'node:assert/strict';
import {dayProgress,progressEnvelope,readProgressSnapshot,readProgressAck,makeProgressIntent,acceptProgress} from '../lib/trips/progress.ts';
const ownerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tripId='11111111-1111-4111-8111-111111111111';
const a='33333333-3333-4333-8333-333333333333',b='44444444-4444-4444-8444-444444444444',c='55555555-5555-4555-8555-555555555555';
const requestId='77777777-7777-4777-8777-777777777777';
const day={id:'22222222-2222-4222-8222-222222222222',offset:0,title:'Day',stops:[
 {id:b,position:1,placeId:null},{id:a,position:0,placeId:null},{id:c,position:2,placeId:null},
]};
const trip={id:tripId,revision:7,days:[day]};
const base={ownerId,tripId,tripRevision:7,progressRevision:0,entries:[]};
test('CASE1 next stop follows original position while visited and skipped both count as completed',()=>{
 assert.equal(dayProgress(day,[]).nextStopId,a);
 const state=dayProgress(day,[{stopId:a,state:'visited'},{stopId:b,state:'skipped'}]);
 assert.equal(state.nextStopId,c);assert.equal(state.completed,2);assert.equal(state.visited,1);assert.equal(state.skipped,1);
 assert.equal(state.complete,false);
 assert.equal(dayProgress(day,[{stopId:a,state:'pending'},{stopId:b,state:'skipped'}]).nextStopId,a);
 assert.equal(day.stops[0].id,b);
});
test('CASE2 request envelope fixes stable IDs and both revisions and does not depend on coordinates',()=>{
 const intent=makeProgressIntent(trip,base,a,'visited',requestId);
 assert.deepEqual(intent,{requestId,stopId:a,state:'visited',expectedTripRevision:7,expectedProgressRevision:0});
 assert.throws(()=>makeProgressIntent({...trip,revision:8},base,a,'visited',requestId),/PROGRESS_CONFLICT/);
 assert.throws(()=>makeProgressIntent(trip,base,other,'visited',requestId),/STOP_NOT_FOUND/);
 for(const patch of [{ownerId:other},{state:'arrived'},{state:['visited']},{expectedProgressRevision:-1},
  {expectedProgressRevision:'0'},{expectedTripRevision:0},{requestId:'bad'},{allowReplace:true}]){
  assert.throws(()=>progressEnvelope({...intent,...patch}),/PROGRESS_INVALID/);
 }
 assert.equal(progressEnvelope({...intent,stopId:a.toUpperCase()}).stopId,a);
});
test('CASE2 owner-bound snapshots reject foreign rows, duplicates, invalid states and version shapes',()=>{
 assert.deepEqual(readProgressSnapshot(base,ownerId,tripId),base);
 for(const value of [{...base,ownerId:other},{...base,tripId:other},{...base,progressRevision:-1},
  {...base,entries:[{stopId:a,state:'unknown'}]},
  {...base,entries:[{stopId:a,state:'visited'},{stopId:a,state:'skipped'}]}]){
  assert.equal(readProgressSnapshot(value,ownerId,tripId),null);
 }
 assert.deepEqual(readProgressSnapshot({...base,privateNote:'must not return'},ownerId,tripId),base);
});
test('CASE2 response-loss replay confirms the original request while retaining a newer canonical state',()=>{
 const intent=makeProgressIntent(trip,base,a,'visited',requestId);
 const latest={...base,progressRevision:2,entries:[{stopId:a,state:'pending'}]};
 const ack={snapshot:latest,requestId,appliedProgressRevision:1,replayed:true};
 assert.deepEqual(readProgressAck(ack,intent,ownerId,tripId).snapshot,latest);
 assert.equal(readProgressAck({...ack,requestId:other},intent,ownerId,tripId),null);
 assert.equal(readProgressAck({...ack,appliedProgressRevision:99},intent,ownerId,tripId),null);
 assert.equal(readProgressAck({...ack,snapshot:base},intent,ownerId,tripId),null);
});
test('CASE2 late reads cannot roll the confirmed state or trip revision backwards',()=>{
 const latest={...base,progressRevision:2,entries:[{stopId:b,state:'skipped'}]};
 assert.equal(acceptProgress(latest,{...base,progressRevision:1}),latest);
 assert.equal(acceptProgress({...latest,tripRevision:8},latest).tripRevision,8);
 assert.equal(acceptProgress(latest,{...latest,ownerId:other}),latest);
});
test('CASE3 reorder and removed IDs never transfer progress by array position',()=>{
 const reordered={...day,stops:[{id:c,position:0},{id:b,position:1},{id:a,position:2}]};
 const entries=[{stopId:a,state:'visited'},{stopId:other,state:'skipped'}];
 assert.equal(dayProgress(reordered,entries).nextStopId,c);
 assert.equal(dayProgress(reordered,entries).completed,1);
 const removed={...reordered,stops:reordered.stops.filter(stop=>stop.id!==a)};
 assert.equal(dayProgress(removed,entries).completed,0);
 assert.equal(dayProgress(removed,entries).total,2);
});
test('CASE3 complete, undo, empty and duplicate stable IDs have honest totals',()=>{
 const entries=[{stopId:a,state:'visited'},{stopId:b,state:'skipped'},{stopId:c,state:'visited'}];
 assert.equal(dayProgress(day,entries).complete,true);
 assert.equal(dayProgress(day,entries).nextStopId,null);
 assert.equal(dayProgress(day,entries.slice(0,2)).complete,false);
 assert.equal(dayProgress({...day,stops:[]},entries).complete,false);
 assert.equal(dayProgress({...day,stops:[]},entries).total,0);
 assert.equal(dayProgress({...day,stops:[day.stops[0],day.stops[0]]},entries).total,1);
});
