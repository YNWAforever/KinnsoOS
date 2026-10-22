import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const id='11111111-1111-4111-8111-111111111111',tripId='22222222-2222-4222-8222-222222222222';
const guide={id,kind:'itinerary',version:2,title:'Original authored guide',destinationId:null,creator:{id:'author',name:'Original author',handle:null},publishedAt:'2026-10-22T12:00:00Z',days:[{id:'guide-day',offset:0,title:'Original day',stops:[{id:'guide-stop',title:'Original stop',description:'Authored instructions',placeId:null,position:0,startMinuteOfDay:null,durationMinutes:0,source:null}]}]};
const trip={id:tripId,ownerId:'actor-A',title:'My private trip',timezone:'America/New_York',startDate:null,revision:3,days:[{id:'day',offset:0,title:'Saved day',stops:[{id:'stop',title:'Saved stop',travellerNote:'Original private note',startMinuteOfDay:0,durationMinutes:0,source:null}]}],sources:[]};
for(const locale of ['en','zh-HK'])test(`guide ${locale}: first-trip entry retains guide identity and adoption review shows the actual target zone without a write`,async()=>{
 let reads=0,writes=0;const before=JSON.stringify(trip);
 const h=await workspaceHarness('GuideWorkspace',{guides:{get:async()=>({ok:true,data:guide})},bookmarks:{list:async()=>({ok:true,data:{items:[],nextCursor:null}})},trips:{list:async()=>({ok:true,data:{items:[{id:tripId,title:trip.title,revision:3}],nextCursor:null}}),get:async()=>{reads++;return{ok:true,data:trip};},adopt:async()=>{writes++;throw Error('Review must not write');}}},{id,initialGuide:guide,locale,document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}}});
 const create=h.find('a',locale==='en'?'Create a trip first':'先建立行程');assert.ok(create);assert.equal(create.props.href,`/${locale}/trips?fromGuide=${id}`);
 h.elements().find(el=>el.type==='select').props.onChange({target:{value:tripId}});h.render();
 h.find('button',locale==='en'?'Apply published itinerary':'套用已發布行程').props.onClick();for(let i=0;i<4;i++){await tick();h.render();}
 assert.match(h.text(),/America\/New_York/);assert.equal(reads,1);assert.equal(writes,0);assert.equal(JSON.stringify(trip),before);
 assert.equal(trip.days[0].stops[0].startMinuteOfDay,0);assert.equal(trip.startDate,null);
});
