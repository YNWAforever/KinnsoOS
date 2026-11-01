import test from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const m=await studioModule('traveller-tasks');
const source={guideId:'g',guideVersion:3,creatorId:'a',creatorName:'示例作者',canonicalUrl:null,withdrawn:false};
const stop={id:'s',placeId:null,title:'海旁',position:0,startMinuteOfDay:600,durationMinutes:30,travellerNote:'PRIVATE',sourceDescription:'原創描述',source};
const trip={id:'t',title:'示例',revision:4,days:[{id:'d',offset:0,title:'第一天',stops:[stop]}],media:[{id:'m',ownerId:'owner',visibility:'private',state:'ready'}]};
test('public projection never leaks private notes or unselected media',()=>{
 assert.equal(typeof m.travellerPublicProjection,'function');
 const p=m.travellerPublicProjection(trip,['s'],[], 'owner');
 assert.ok(!JSON.stringify(p).includes('PRIVATE'));assert.deepEqual(p.approvedMediaIds,[]);assert.equal(p.days[0].stops[0].source.guideVersion,3);
 assert.throws(()=>m.travellerPublicProjection(trip,['missing'],[],'owner'));
 assert.throws(()=>m.travellerPublicProjection(trip,['s'],['m'],'another'));
 assert.throws(()=>m.travellerPublicProjection({...trip,media:[{...trip.media[0],state:'pending'}]},['s'],['m'],'owner'));
});
test('adoption requires an exact structured version and retains source credit',()=>{
 assert.equal(typeof m.travellerAdoptionEvidence,'function');
 assert.throws(()=>m.travellerAdoptionEvidence({kind:'summary',id:'g',title:'摘要'},trip));
 const guide={kind:'itinerary',id:'g',version:3,title:'原創',creator:{id:'a',name:'示例作者'},days:[{id:'d',stops:[{...stop,source:null}]}]};
 const evidence=m.travellerAdoptionEvidence(guide,trip);assert.equal(evidence.version,3);assert.equal(evidence.privateNotesKept,1);assert.equal(evidence.creatorName,'示例作者');
});
test('readback verifies command content and cannot treat an acknowledgement as saved',()=>{
 assert.equal(typeof m.travellerCommandPresent,'function');
 assert.equal(m.travellerCommandPresent(trip,{type:'updateStop',id:'s',patch:{travellerNote:'PRIVATE'}}),true);
 assert.equal(m.travellerCommandPresent(trip,{type:'updateStop',id:'s',patch:{travellerNote:'different'}}),false);
 assert.equal(m.travellerCommandPresent(trip,{type:'attachMedia',mediaId:'not-uploaded',stopId:null}),false);
});
