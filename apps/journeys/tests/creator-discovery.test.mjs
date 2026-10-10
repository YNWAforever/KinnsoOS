import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignCommand} from '../lib/merchants/campaigns.ts';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const discovery=await import('../lib/merchants/creator-discovery.ts').catch(()=>({}));
const id='11111111-1111-4111-8111-111111111111',creatorId='22222222-2222-4222-8222-222222222222',updatedAt='2026-10-10T12:00:00.123456Z';
test('discovery query rejects duplicated, unknown, oversized and malformed filters before IO',()=>{
 assert.equal(typeof discovery.discoveryQuery,'function');
 assert.deepEqual(discovery.discoveryQuery(new URLSearchParams('q=city&savedOnly=true')),{q:'city',savedOnly:true});
 for(const q of ['q=a&q=b','q='+('a'.repeat(101)),'savedOnly=yes','savedOnly=true&savedOnly=false','after=','userId='+id,'after='+('a'.repeat(1501))])assert.throws(()=>discovery.discoveryQuery(new URLSearchParams(q)),/INVALID/);
});
test('saved/private-note and invite commands retain authored input and exact CAS state',()=>{
 for(const type of ['saveCreator','unsaveCreator'])assert.deepEqual(campaignCommand({type,id:creatorId,reason:'Owner shortlist'}),{type,id:creatorId,reason:'Owner shortlist'});
 const note={type:'setSavedNote',id:creatorId,note:'Private assessment',expectedUpdatedAt:updatedAt,reason:'Owner note'};
 assert.deepEqual(campaignCommand(note),note);
 const invite={type:'inviteCreator',id,creatorId,expectedUpdatedAt:updatedAt,reason:'Owner invitation'};
 assert.deepEqual(campaignCommand(invite),invite);
 for(const c of [{...invite,expectedUpdatedAt:undefined},{...invite,creatorId:'not-a-uuid'},{...invite,quota:999},{...note,note:'a'.repeat(2001)},{...note,expectedUpdatedAt:undefined}])assert.throws(()=>campaignCommand(c),/INVALID/);
});
test('discovery renders real public attributes and clears private notes after account invalidation',async()=>{
 const data={items:[{id:creatorId,handle:'city-author',name:'City author',bio:'Original city guides',niches:['City'],languages:['en'],audienceGeos:['HK'],platforms:['instagram'],guideCount:2,lastGuideAt:null,saved:true,note:'Owner private note',savedUpdatedAt:updatedAt}],nextCursor:null,quota:{limit:3,used:0,remaining:3,periodStart:updatedAt},campaigns:[],campaignsNextCursor:null};
 const h=await workspaceHarness('MerchantCreatorDiscovery',{merchantCreators:{list:async()=>({ok:true,data})}});await tick();h.render();
 assert.match(h.text(),/City author/);assert.match(h.text(),/Original city guides/);assert.equal(h.field('Private note').props.value,'Owner private note');
 h.invalidate();assert.doesNotMatch(h.text(),/City author/);assert.ok(!h.field('Private note'));
});
test('unknown discovery writes reconcile a receipt before replaying the unchanged request and payload',async()=>{
 const events=[],data={items:[{id:creatorId,handle:'city-author',name:'City author',bio:'Original',niches:[],languages:[],audienceGeos:[],platforms:[],guideCount:0,lastGuideAt:null,saved:false,note:null,savedUpdatedAt:null}],nextCursor:null,quota:{limit:3,used:0,remaining:3,periodStart:updatedAt},campaigns:[],campaignsNextCursor:null};let writes=0;
 const port={list:async()=>({ok:true,data}),command:async(...args)=>{events.push(['write',...args]);return ++writes===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{id:creatorId,merchantId:id,operation:'saveCreator'}};},receipt:async(...args)=>{events.push(['receipt',...args]);return{ok:true,data:{result:null}};}};
 const h=await workspaceHarness('MerchantCreatorDiscovery',{merchantCreators:port});h.find('button','Save creator').props.onClick();await tick();h.render();
 assert.match(h.text(),/result is not confirmed/);assert.ok(h.find('button','Save creator').props.disabled);
 h.find('button','Retry the same request').props.onClick();await tick();h.render();
 assert.deepEqual(events.map(x=>x[0]),['write','receipt','write']);assert.deepEqual(events[2],events[0]);
});
