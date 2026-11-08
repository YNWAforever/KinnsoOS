import {test as baseTest} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {studioModule} from './helpers/studio-load.mjs';import {discoveryModule} from './helpers/discovery-load.mjs';import {publishedFixture,cmd,now,company,fixturesAvailable} from './helpers/discovery-fixture.mjs';
const test=fixturesAvailable?baseTest:baseTest.skip;
const d=await discoveryModule('brief'),e=await studioModule('evidence');
async function matched(){const x=await publishedFixture(),id=randomUUID(),run=randomUUID();await x.check(cmd('saveIntent',id,{cityKey:'city:hk:hong-kong',dateSpec:{kind:'fixed',start:'2026-11-07',end:'2026-11-09'},budget:null,interestTags:['散步'],languages:['zh-HK']}));await x.check(cmd('recordMatch',run,{intentId:id,intentRevision:1}));await x.check(cmd('chooseOffer',x.publicationId,{intentId:id,publicationId:x.publicationId,choice:'saved'}));return {...x,run};}
test('matched brief builder exists',()=>assert.equal(typeof d.buildMatchedBrief,'function'));
test('merchant_text_never_becomes_creator_own; editing preserves provenance',async()=>{
 const {b,run,publicationId}=await matched();const r=await d.resolveMatchedSources({matchRunId:run,publicationId},b);assert.equal(r.ok,true);const source=r.sources[0];assert.equal(source.rights,'licensed');
 const brief=d.buildMatchedBrief({id:randomUUID(),threadId:randomUUID(),title:'示例故事',city:'香港',summary:'我的原創摘要',selectedSourceIds:[source.id]},r.sources);
 const edited=e.editBriefBlock(brief,brief.blocks[0].id,{text:'重新寫過的文字',sources:[]});assert.deepEqual(edited.blocks[0].sources,brief.blocks[0].sources);
 e.assertSource(edited.blocks[0].sources[0],r.sources,'private',new Date(now()));
});
test('licensed requires exact version hash and purpose; revoked source blocks reopen and handoff',async()=>{
 const {b,run,publicationId,check}=await matched(),r=await d.resolveMatchedSources({matchRunId:run,publicationId},b),s=r.sources[0],ref={sourceId:s.id,version:s.version,aclVersion:s.aclVersion,hash:s.hash};
 assert.throws(()=>e.assertSource({...ref,hash:'wrong'},[s],'public',new Date(now())),/STALE/);
 const grants=(await b.read({kind:'companyOffers',companyId:company})).data.grants,g=grants.find(g=>g.purpose==='public_guide');await check(cmd('revokeContentUse',g.id,{},g.grantVersion));
 const restrictedPublic=await d.resolveMatchedSources({matchRunId:run,publicationId},b);assert.equal(restrictedPublic.ok,true);assert.throws(()=>e.assertSource(ref,restrictedPublic.sources,'public',new Date(now())),/UNVERIFIED|RESTRICTED/);
 const privateGrant=grants.find(g=>g.purpose==='private_brief');await check(cmd('revokeContentUse',privateGrant.id,{},privateGrant.grantVersion));assert.equal((await d.resolveMatchedSources({matchRunId:run,publicationId},b)).ok,false);
});
test('unknown rights stays private',()=>{const s={id:'a',version:1,aclVersion:1,hash:'x',status:'active',rights:'unknown'},ref={sourceId:'a',version:1,aclVersion:1,hash:'x'};assert.equal(e.assertSource(ref,[s],'private'),s);assert.throws(()=>e.assertSource(ref,[s],'public'),/UNVERIFIED/);});
