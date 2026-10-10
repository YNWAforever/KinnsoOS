import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignCommand} from '../lib/merchants/campaigns.ts';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
import {readFile} from 'node:fs/promises';import {createContext,runInContext} from 'node:vm';import {transform} from 'esbuild';
const discoveryModule={exports:{}},repositoryCalls=[];
const discoverySource=await readFile(new URL('../lib/merchants/creator-discovery.ts',import.meta.url),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
if(discoverySource){const compiled=await transform(discoverySource,{loader:'ts',format:'cjs'});runInContext(compiled.code,createContext({module:discoveryModule,exports:discoveryModule.exports,URLSearchParams,require:()=>({request:(...args)=>{repositoryCalls.push(args);return Promise.resolve({ok:true,data:{}});}})}));}
const discovery=discoveryModule.exports;
const id='11111111-1111-4111-8111-111111111111',creatorId='22222222-2222-4222-8222-222222222222',updatedAt='2026-10-10T12:00:00.123456Z';
test('discovery query rejects duplicated, unknown, oversized and malformed filters before IO',()=>{
 assert.equal(typeof discovery.discoveryQuery,'function');
 assert.deepEqual(JSON.parse(JSON.stringify(discovery.discoveryQuery(new URLSearchParams('q=city&savedOnly=true')))),{q:'city',savedOnly:true});
 for(const q of ['q=a&q=b','q='+('a'.repeat(101)),'savedOnly=yes','savedOnly=true&savedOnly=false','after=','userId='+id,'after='+('a'.repeat(1501))])assert.throws(()=>discovery.discoveryQuery(new URLSearchParams(q)),/INVALID/);
});
test('actual discovery repository omits cleared optional cursors from reload and post-write queries',async()=>{
 await discovery.merchantCreators.list(id,{q:'city',after:undefined,campaignsAfter:undefined,savedOnly:false});const url=new URL(repositoryCalls.at(-1)[0],'https://local.test');
 assert.equal(url.searchParams.has('after'),false);assert.equal(url.searchParams.has('campaignsAfter'),false);assert.equal(url.searchParams.get('savedOnly'),'false');assert.equal(url.searchParams.get('q'),'city');
});
test('saved/private-note and invite commands retain authored input and exact CAS state',()=>{
 for(const type of ['saveCreator','unsaveCreator'])assert.deepEqual(campaignCommand({type,id:creatorId,reason:'Owner shortlist'}),{type,id:creatorId,reason:'Owner shortlist'});
 const note={type:'setSavedNote',id:creatorId,note:'Private assessment',expectedUpdatedAt:updatedAt,reason:'Owner note'};
 assert.deepEqual(campaignCommand(note),note);
 const invite={type:'inviteCreator',id,creatorId,expectedUpdatedAt:updatedAt,reason:'Owner invitation'};
 assert.deepEqual(campaignCommand(invite),invite);
 for(const c of [{...invite,expectedUpdatedAt:undefined},{...invite,creatorId:'not-a-uuid'},{...invite,quota:999},{...note,note:'a'.repeat(2001)},{...note,expectedUpdatedAt:undefined}])assert.throws(()=>campaignCommand(c),/INVALID/);
});
test('mature invitation denials are terminal private errors with no raw SQL detail',async()=>{
 const source=await readFile(new URL('../lib/api/server.ts',import.meta.url),'utf8'),module={exports:{}};const compiled=await transform(source,{loader:'ts',format:'cjs'});runInContext(compiled.code,createContext({module,exports:module.exports,Response,crypto,require:()=>({})}));
 for(const [message,status,code] of [['not_authorized',403,'FORBIDDEN'],['creator_not_found',404,'NOT_FOUND'],['already_participant',409,'CONFLICT'],['invite_quota_exceeded',400,'INVALID']]){const r=module.exports.backendFailure({message});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'private, no-store');const body=await r.json();assert.equal(body.code,code);assert.equal(body.retryable,false);assert.ok(!JSON.stringify(body).includes(message));}
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
test('owner workspace connects discovery and its pending lock protects company switching',async()=>{
 for(const role of ['owner','marketing','clerk']){
  const memberships=[{merchantId:id,name:'Owner company',role,branchIds:[]},{merchantId:creatorId,name:'Other company',role,branchIds:[]}];
  const h=await workspaceHarness('MerchantWorkspace',{request:async url=>url==='/api/merchant'?{ok:true,data:memberships}:{ok:true,data:{merchantId:id,role,missions:[],applications:[],outcomes:[],branches:[],moneyCapability:'historical_records_only'}}},{shallow:true});await tick();h.render();
  const child=h.elements().find(n=>n.type==='MerchantCreatorDiscovery');assert.equal(Boolean(child),role==='owner');
  if(child){assert.equal(child.props.merchantId,id);assert.equal(child.props.actorId,'actor-A');child.props.onLockChange(true);h.render();assert.equal(h.find('select','Company').props.disabled,true);}
 }
});
