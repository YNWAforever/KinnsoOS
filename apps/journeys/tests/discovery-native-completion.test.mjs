import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {discoveryModule} from './helpers/discovery-load.mjs';
import {publishedFixture,cmd,actor,company,now} from './helpers/discovery-fixture.mjs';
const service=await discoveryModule('native-command-service'),authority=await discoveryModule('native-authority');
const key=new Uint8Array(32).fill(11);
async function setup(){
 const f=await publishedFixture(),data=(await f.b.read({kind:'companyOffers',companyId:company})).data;
 const offerImport=data.imports[0],publication=data.publications[0];
 const link={...data.link,workspaceId:data.link.smeWorkspaceId,scopeVersion:1};
 let calls=0;
 const providers={clock:now,key:async()=>({id:'example-only',secret:key}),verifyOwnerProof:async()=>{throw Error('not configured');},sme:{call:async(tool,input)=>{
  calls++;
  return {schemaVersion:'kinnso.sme.read.v1',status:'ready',requestId:randomUUID(),observedAt:new Date(now()).toISOString(),scope:{workspaceId:link.workspaceId,locationId:'location-a',scopeVersion:1},warnings:[],
   data:tool==='sme_offer_evidence_v1'?structuredClone(offerImport.fields):{items:input.refs.map(r=>({offerId:r.offerId,state:'current',currentRevision:r.revision,checkedAt:new Date(now()).toISOString()}))}};
 }}};
 const context=input=>({actorId:actor,identity:'',kind:input.command.kind,targetId:input.targetId,data:{link,offerImport}});
 return {...f,data,offerImport,publication,link,providers,context,calls:()=>calls};
}
test('native import hashes actual SME evidence and keeps target publication identity',async()=>{
 const s=await setup(),input=cmd('importOffer',randomUUID(),{linkId:s.link.id,offerId:s.offerImport.externalOfferId,expectedSourceRevision:1,locationId:'location-a'});
 const result=await service.nativeCommandAuthority(async()=>actor,async()=>s.context(input),s.providers)(input);
 assert.equal(result.ok,true);assert.equal(s.calls(),2);
 const p=await authority.verifyCommandAuthority(result.envelope,{actorId:actor,intent:input,now:now(),key});
 assert.equal(p.facts.check.linkId,s.link.id);assert.equal(p.facts.offer.hash,await service.nativeOfferHash(p.facts.offer));
 assert.equal(p.facts.offer.rightsState,'unverified_for_kinnso_reuse');
});
test('native import rejects changed text under same hash, stale source, wrong workspace and absent consent',async()=>{
 for(const fault of ['hash','stale','workspace','consent']){
  const s=await setup(),input=cmd('importOffer',randomUUID(),{linkId:s.link.id,offerId:s.offerImport.externalOfferId,expectedSourceRevision:1,locationId:'location-a'}),call=s.providers.sme.call;
  s.providers.sme.call=async(tool,args)=>{const r=await call(tool,args);if(fault==='hash'&&tool==='sme_offer_evidence_v1')r.data.title='tampered';if(fault==='workspace')r.scope.workspaceId='foreign';if(fault==='stale'&&r.data.items)r.data.items[0].checkedAt=new Date(now()-60001).toISOString();return r;};
  if(fault==='consent')s.link.readRefreshAllowed=false;
  assert.equal((await service.nativeCommandAuthority(async()=>actor,async()=>s.context(input),s.providers)(input)).ok,false,fault);
  if(fault==='consent')assert.equal(s.calls(),0);
 }
});
test('native matching uses server intent and original matching policy; persisted plan contains no display text',async()=>{
 const s=await setup(),id=randomUUID(),input=cmd('recordMatch',randomUUID(),{intentId:id,intentRevision:1});
 const intent={id,ownerActorId:actor,revision:1,status:'active',cityKey:'city:hk:hong-kong',dateSpec:{kind:'fixed',start:'2026-11-10',end:'2026-11-12'},budget:{currency:'HKD',maxPerPersonMinor:20000},interestTags:['散步'],languages:['zh-HK']};
 const read=async()=>({...s.context(input),data:{intent,choices:[],poolHasMore:true,offers:[{publication:s.publication,import:s.offerImport,link:s.link,grants:s.data.grants,sourceState:'unavailable',checkedAt:null}]}});
 const call=s.providers.sme.call;s.providers.sme.call=async(tool,args)=>{assert.equal(tool,'sme_validate_offer_refs_v1','delegated matching cannot fetch new source prose');return call(tool,args);};
 const hydrate=async(original,proof)=>{assert.deepEqual(original,input);const verified=await authority.verifyCommandAuthority(proof,{actorId:actor,intent:input,now:now(),key});assert.equal(verified.facts.checks[0].publicationId,s.publication.id);return (await read()).data.offers;};
 const result=await service.nativeCommandAuthority(async()=>actor,read,s.providers,hydrate)(input);assert.equal(result.ok,true);assert.equal(s.calls(),1);
 const facts=result.envelope.payload.facts;assert.equal(facts.results.length,1);assert.equal(facts.results[0].score,100);assert.equal(facts.coverage.bounded,true);
 assert.equal('display' in facts.results[0],false);assert.equal(JSON.stringify(facts).includes(s.offerImport.fields.details),false);
 const changed=async()=>{const rows=structuredClone((await read()).data.offers);rows[0].import.fields.title='Changed immutable import';return rows;};
 assert.equal((await service.nativeCommandAuthority(async()=>actor,read,s.providers,changed)(input)).code,'SOURCE_CHANGED');
 assert.equal((await service.nativeCommandAuthority(async()=>actor,read,s.providers)({...input,command:{...input.command,data:{...input.command.data,score:100}}})).ok,false);
});
test('owner proof is bound to company, link, nonce, locations and time',async()=>{
 const s=await setup(),input=cmd('confirmLink',s.link.id,{proof:'SIGNED_EXAMPLE',readRefreshAllowed:true},1),policy=await discoveryModule('policy'),nonce='x'.repeat(43);
 const proof={id:randomUUID(),companyBindingHash:await policy.hashValue({companyId:company,linkId:s.link.id}),nonce,workspaceId:s.link.workspaceId,scopeVersion:1,locationIds:['location-a'],role:'owner',issuedAt:now(),expiresAt:now()+60000};
 const read=async()=>({...s.context(input),data:{link:s.link,nonce}});
 s.providers.verifyOwnerProof=async()=>proof;
 assert.equal((await service.nativeCommandAuthority(async()=>actor,read,s.providers)(input)).ok,true);
 for(const delta of [{role:'member'},{nonce:'y'.repeat(43)},{companyBindingHash:'a'.repeat(64)},{locationIds:['foreign']},{expiresAt:now()-1},{issuedAt:NaN},{expiresAt:Infinity}]){
  s.providers.verifyOwnerProof=async()=>({...proof,...delta});assert.equal((await service.nativeCommandAuthority(async()=>actor,read,s.providers)(input)).ok,false);
 }
});
test('matched source RPC accepts identities only and keeps the UUID after lost acknowledgement',async()=>{
 const {createNativeDiscovery}=await discoveryModule('native');let call;
 const api=createNativeDiscovery({enabled:()=>true,rpc:async(name,args)=>{call={name,args};throw Error('lost');}});
 const input={threadId:randomUUID(),sourceId:randomUUID(),matchRunId:randomUUID(),publicationId:randomUUID(),requestId:randomUUID()};
 assert.equal((await api.source({...input,rights:'own',body:'browser text'})).code,'INVALID');assert.equal(call,undefined);
 assert.equal((await api.source(input)).code,'TIMEOUT');assert.equal(call.name,'ingest_kinnso_matched_source');assert.equal(call.args.p_request_id,input.requestId);
});
const sql=name=>{const source=new URL('../../../supabase/migrations/'+name,import.meta.url),packed=new URL('./contracts/'+name,import.meta.url);return readFileSync(existsSync(source)?source:packed,'utf8');};
test('unapplied continuation guards contain all native operations, default-closed gates and no elevated write grant',()=>{
 const commands=sql('20261101100000_discovery_native_commands.sql');
 for(const operation of ['beginLink','confirmLink','revokeLink','importOffer','preparePublication','grantContentUse','revokeContentUse','publishOffer','withdrawOffer','recordMatch','chooseOffer'])assert.ok([...commands.matchAll(/(?:if|elsif) k(?:='([^']+)'| in\(([^)]+)\))/g)].some(m=>(m[1]??m[2]).includes(operation)),operation);
 assert.match(commands,/licensed_writes boolean not null default false/);assert.match(commands,/nonce text.*43/);assert.match(commands,/discovery_used_proofs/);
 assert.match(commands,/p_envelope->>'signature' is distinct from encode\(extensions.hmac/);assert.match(commands,/insert into public.offer_publications\(id,company_id,import_id,revision\)/);
 assert.doesNotMatch(commands,/grant (all|execute).*service_role/i);
});
test('source-only reader and transaction checks cover direct rows, receipts, multiple share slots and immutable lineage',()=>{
 const readers=sql('20261101100100_discovery_native_readers.sql'),writes=sql('20261101100200_discovery_native_transactions.sql'),original=sql('20261101100300_discovery_original_writer_guards.sql');
 for(const name of ['discovery_guide_read','discovery_version_read','discovery_day_read','discovery_stop_read'])assert.ok(readers.includes('create policy '+name));
 assert.match(readers,/primary key\(.*projection_slot/);assert.match(readers,/discovery_project_trip\(r->'projection'/);
 for(const trigger of ['discovery_bind_guide','discovery_bind_day','discovery_bind_stop','discovery_bind_share'])assert.ok(writes.includes('create trigger '+trigger));
 assert.match(writes,/new\.rights_state is distinct from old\.rights_state/);assert.match(writes,/revision,acl_version,content_hash/);
 assert.match(original,/source_guide_day_id/);assert.match(original,/source_guide_stop_id/);assert.match(original,/discovery_project_trip\(v_prior.result\)/);
 assert.match(original,/for share nowait/);assert.doesNotMatch(original,/drop table|delete from public\.guides/i);
});
