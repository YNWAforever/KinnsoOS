import {test as baseTest} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {discoveryModule} from './helpers/discovery-load.mjs';
import {publishedFixture,cmd,actor,company,now,fixturesAvailable} from './helpers/discovery-fixture.mjs';
const test=fixturesAvailable?baseTest:baseTest.skip;

const native=await discoveryModule('native'),policy=await discoveryModule('policy');
const {discoveryDomainTransport}=await discoveryModule('domain-transport');
const sql=name=>{const source=new URL('../../../supabase/migrations/'+name,import.meta.url),packed=new URL('./contracts/'+name,import.meta.url);return readFileSync(existsSync(source)?source:packed,'utf8');};

test('lost confirmation acknowledgement recovers the same receipt after its nonce is consumed',async()=>{
 const input=cmd('confirmLink',randomUUID(),{proof:'EXAMPLE',readRefreshAllowed:true},1);
 let committed=null,observations=0,writes=0;
 const api=native.createNativeDiscovery({enabled:()=>true,authority:async()=>{
  observations++;return committed?{ok:false,code:'NOT_CONNECTED',retryable:false}:{ok:true,envelope:{example:true}};
 },rpc:async(name,args)=>{
  if(name==='get_kinnso_discovery_request')return {error:null,data:committed?{status:'complete',resourceState:'present',receipt:committed}:{status:'unknown'}};
  writes++;committed={requestId:args.p_request_id,resourceId:args.p_target_id,revision:2,commandDigest:await policy.commandDigest(input)};
  throw Error('ACK lost after commit');
 }});
 assert.equal((await api.command(input)).code,'TIMEOUT');
 const recovered=await api.command(input);assert.equal(recovered.ok,true);assert.deepEqual(recovered.receipt,committed);
 assert.equal(observations,1);assert.equal(writes,1);
 assert.equal((await api.command({...input,command:{...input.command,data:{...input.command.data,readRefreshAllowed:false}}})).code,'CONFLICT');
 assert.equal(writes,1);
});

async function domainFixture(){
 const f=await publishedFixture(),data=(await f.b.read({kind:'companyOffers',companyId:company})).data;
 const imported=data.imports[0],link={...data.link,workspaceId:data.link.smeWorkspaceId,scopeVersion:1};
 const ref={offerId:imported.externalOfferId,revision:imported.sourceRevision,hash:imported.sourceHash,locationId:imported.appliedLocationId};
 const context={actorId:actor,refs:[{importId:imported.id,link,ref}]};
 const calls=[],providerCalls=[],state={contextReads:0,after:null,stale:false,consent:true};
 const providers={clock:now,key:async()=>({id:'example',secret:new Uint8Array(32).fill(3)}),verifyOwnerProof:async()=>{throw Error('unused');},sme:{call:async(tool,input)=>{
  providerCalls.push({tool,input});assert.equal(tool,'sme_validate_offer_refs_v1');
  return {schemaVersion:'kinnso.sme.read.v1',status:'ready',requestId:randomUUID(),observedAt:new Date(now()).toISOString(),scope:{workspaceId:link.workspaceId,locationId:ref.locationId,scopeVersion:1},warnings:[],
   data:{items:input.refs.map(r=>({offerId:r.offerId,state:'current',currentRevision:r.revision,checkedAt:new Date(now()-(state.stale?60001:0)).toISOString()}))}};
 }}};
 const transport=async(url,init)=>{
  const method=new URL(url).pathname.split('/').pop(),args=JSON.parse(init.body);calls.push({method,args,headers:init.headers});
  if(method==='get_kinnso_discovery_domain_context'){
   state.contextReads++;const value=structuredClone(state.contextReads>1&&state.after?state.after:context);
   value.refs.forEach(r=>r.link.readRefreshAllowed=state.consent);return Response.json(value);
  }
  return Response.json({saved:true,requestId:args.p_args?.p_request_id??args.p_request_id});
 };
 return {context,calls,providerCalls,state,transport,providers};
}
const args=()=>({p_draft_id:randomUUID(),p_expected_revision:7,p_request_id:randomUUID(),p_payload:{title:'Example edited after several minutes'}});
const request=(fetcher,body,method='save_kinnso_guide_draft')=>fetcher('https://example.invalid/rest/v1/rpc/'+method,{method:'POST',headers:{Authorization:'Bearer EXAMPLE_ONLY'},body:JSON.stringify(body)});

test('disabled transport preserves the original call; enabled own content needs no provider',async()=>{
 const s=await domainFixture(),body=args();
 assert.equal((await request(discoveryDomainTransport({enabled:()=>false,transport:s.transport}),body)).status,200);
 assert.deepEqual(s.calls.map(c=>c.method),['save_kinnso_guide_draft']);assert.equal(s.providerCalls.length,0);
 s.calls.length=0;s.context.refs=[];
 assert.equal((await request(discoveryDomainTransport({enabled:()=>true,transport:s.transport}),body)).status,200);
 assert.deepEqual(s.calls.map(c=>c.method),['get_kinnso_discovery_domain_context','save_kinnso_guide_draft']);
});

test('original writer refreshes refs after editing and keeps args, revision and UUID in one bound transaction',async()=>{
 const s=await domainFixture(),body=args(),fetcher=discoveryDomainTransport({enabled:()=>true,transport:s.transport,providers:s.providers});
 assert.equal((await request(fetcher,body)).status,200);
 assert.deepEqual(s.calls.map(c=>c.method),['get_kinnso_discovery_domain_context','get_kinnso_discovery_domain_context','apply_kinnso_discovery_bound_write']);
 const write=s.calls.at(-1);assert.deepEqual(write.args.p_args,body);assert.equal(write.args.p_method,'save_kinnso_guide_draft');
 assert.equal(write.args.p_authority.payload.requestId,body.p_request_id);assert.equal(write.args.p_authority.payload.actorId,actor);
 assert.equal(write.args.p_authority.payload.commandDigest,await policy.hashValue({method:'save_kinnso_guide_draft',args:body}));
 assert.equal(write.args.p_authority.payload.facts.checks[0].check.checkedAt,new Date(now()).toISOString());
 assert.equal(s.providerCalls.length,1);assert.deepEqual(write.headers,{Authorization:'Bearer EXAMPLE_ONLY'});
});

test('source refresh fails closed for changed actor, scope, stale observation, or withdrawn consent',async()=>{
 for(const fault of ['actor','scope','stale','consent','missing']){
  const s=await domainFixture();
  if(fault==='actor'||fault==='scope'){s.state.after=structuredClone(s.context);if(fault==='actor')s.state.after.actorId=randomUUID();else s.state.after.refs[0].link.scopeVersion++;}
  if(fault==='stale')s.state.stale=true;if(fault==='consent')s.state.consent=false;
  const response=await request(discoveryDomainTransport({enabled:()=>true,transport:s.transport,providers:fault==='missing'?undefined:s.providers}),args());
  assert.equal(response.status,503,fault);assert.ok(!s.calls.some(c=>c.method==='apply_kinnso_discovery_bound_write'),fault);
  if(fault==='consent'||fault==='missing')assert.equal(s.providerCalls.length,0);
 }
});

test('guide markers remain attached to the same blocks when the existing editor reorders them',async()=>{
 const editor=await discoveryModule('editor-operations','creators');
 const licensed={title:'Licensed stop',studioBlockId:randomUUID()},own={title:'My own stop'};
 const original={days:[{offset:0,title:'Own day',stops:[licensed,own]},{offset:1,title:'Another own day',stops:[]}]};
 const moved=editor.moveDay(editor.moveStop(original,0,0,1),0,1);
 assert.equal(moved.days[1].stops[1].studioBlockId,licensed.studioBlockId);assert.equal('studioBlockId' in moved.days[1].stops[0],false);
 assert.equal(original.days[0].stops[0],licensed);assert.equal(moved.days[1].title,'Own day');
});

test('unapplied final reader keeps the latest Creator 360 listing and role predicates',()=>{
 const generated=sql('20261101100300_discovery_original_writer_guards.sql');
 assert.match(generated,/Source: 20260717124836_r7_3_production_honesty.sql/);
 const creator=generated.slice(generated.indexOf('function public.admin_creator_detail'),generated.indexOf('function public.get_attributed_guides_for_merchant'));
 assert.match(creator,/is_listed/);assert.match(creator,/discovery_guide_visible/);assert.match(creator,/admin|ops/);
});

test('unapplied final bindings use exact upstream stops, retain editor lineage and invoke original writers',()=>{
 const lineage=sql('20261101100600_discovery_field_lineage.sql'),editor=sql('20261101100700_discovery_editor_lineage.sql'),refresh=sql('20261101100500_discovery_source_refresh.sql');
 assert.match(lineage,/upstream_stop_id=new\.source_guide_stop_id/);assert.match(lineage,/where b->>'id'=block_id/);
 assert.match(lineage,/invalid_lineage_change/);assert.match(lineage,/revision=p_revision/);
 assert.match(editor,/legacy_save_kinnso_guide_draft\([^;]+discovery_strip_markers/);assert.match(editor,/discovery_restore_markers\(v_guide_id,d.payload\)/);
 assert.match(refresh,/then return public\.save_kinnso_guide_draft/);assert.match(refresh,/then return public\.adopt_guide_to_trip/);
 assert.match(refresh,/facts:=kinnso_internal.discovery_authority/);assert.match(refresh,/licensed_writes and private_writes/);
});
