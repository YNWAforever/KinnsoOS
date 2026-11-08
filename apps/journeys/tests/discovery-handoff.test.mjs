import {test as baseTest} from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {publishedFixture,cmd,company} from './helpers/discovery-fixture.mjs';
const mockUrl=new URL('../../../docs/prototypes/conversation-studio-local/mock-backend.mjs',import.meta.url),travellerUrl=new URL('../../../docs/prototypes/conversation-studio-local/traveller-backend.mjs',import.meta.url);
const {createExampleBackend}=existsSync(mockUrl)?await import(mockUrl):{};
const {TRAVELLER_IDS}=existsSync(travellerUrl)?await import(travellerUrl):{};
const test=typeof createExampleBackend==='function'&&TRAVELLER_IDS?baseTest:baseTest.skip;
async function setup({onlyLicensed=false,licensedMetadata=false}={}){const publicShares=new Map(),h=createExampleBackend({origin:'http://127.0.0.1:3501',publicShares}),x=await publishedFixture({backendInstance:h.discovery}),id=randomUUID(),run=randomUUID(),threadId=randomUUID();
 await x.check(cmd('saveIntent',id,{cityKey:'city:hk:hong-kong',dateSpec:{kind:'fixed',start:'2026-11-07',end:'2026-11-09'},budget:null,interestTags:['散步'],languages:['zh-HK']}));await x.check(cmd('recordMatch',run,{intentId:id,intentRevision:1}));await x.check(cmd('chooseOffer',x.publicationId,{intentId:id,publicationId:x.publicationId,choice:'saved'}));const matchContext={matchRunId:run,publicationId:x.publicationId},source=(await h.discovery.resolveSources(matchContext)).sources[0];
 const studio=(kind,targetId,data,expectedRevision=0)=>{const body={requestId:randomUUID(),expectedRevision,payload:{kind,targetId,data}},r=h('POST','/api/studio/commands',body);assert.equal(r.body.ok,true,kind+':'+r.body.code);return {body,value:r.body.data.data};};
 studio('createThread',threadId,{topic:'creation',templateId:'C1',title:'配對創作'});studio('saveSource',source.id,{threadId,title:source.title,text:source.text,rights:'licensed',matchContext});
 const ownId=randomUUID();const own=studio('saveSource',ownId,{threadId,title:'我的散步筆記',text:'OWN_BLOCK_REMAINS',rights:'own',attested:true}).value;
 const brief={id:randomUUID(),threadId,revision:0,title:'創作示例 guide',city:'香港',summary:licensedMetadata?source.text:'我的原創摘要',blocks:[source,own].filter(s=>!onlyLicensed||s.id!==ownId).map(s=>({id:s.id,title:s.title,text:s.text,intendedUse:'public-candidate',sources:[{sourceId:s.id,version:s.version,aclVersion:s.aclVersion,hash:s.hash}]}))};studio('saveArtifact',brief.id,{threadId,brief});
 const editedPayload=licensedMetadata?{title:source.title,city:brief.city,summary:source.text,content:{days:[{offset:0,title:source.title,stops:brief.blocks.map(b=>({title:b.title,description:b.text,placeId:null,startMinuteOfDay:null,durationMinutes:null}))}]}}:undefined;
 const guideId=randomUUID(),saveId=randomUUID(),prepare=studio('prepareGuideSave',randomUUID(),{artifactId:brief.id,artifactRevision:1,guideId,expectedGuideRevision:0,domainRequestId:saveId,selectedBlockIds:brief.blocks.map(b=>b.id),...(editedPayload?{editedPayload}:{}),confirmed:true});
 const saveBody={requestId:saveId,expectedRevision:0,payload:prepare.value.payload};const saved=h('PUT','/api/creator/guides/'+guideId,saveBody);assert.equal(saved.body.ok,true,'original guide writer');
 const publishId=randomUUID();studio('prepareGuidePublish',randomUUID(),{guideId,expectedGuideRevision:1,domainRequestId:publishId,confirmed:true});const publishBody={requestId:publishId,expectedRevision:1},published=h('POST','/api/creator/guides/'+guideId+'/publish',publishBody);assert.equal(published.body.ok,true,'original publish');
 return {...x,h,guideId,source,studio,saveBody,publishBody,published:published.body.data,publicShares,threadId,run,intentId:id};
}
test('matched_brief_uses_existing_guide_writer; lost acknowledgement retains UUID and version',async()=>{
 const x=await setup(),retry=x.h('POST','/api/creator/guides/'+x.guideId+'/publish',x.publishBody);assert.deepEqual(retry.body.data,x.published);assert.equal(x.h('GET','/__preview/versions/'+x.guideId).body.data.items.length,1);assert.ok(x.h.discovery.bindings().some(b=>b.targetKind==='guide_version'));
});
test('public_guide_does_not_grant_adoption_or_share',async()=>{
 const x=await setup();let data=(await x.b.read({kind:'companyOffers',companyId:company})).data;const grant=data.grants.find(g=>g.purpose==='trip_adoption');await x.check(cmd('revokeContentUse',grant.id,{},grant.grantVersion));
 const before=x.h('GET','/api/trips/'+TRAVELLER_IDS.trip).body.data,r=x.h('POST','/api/trips/'+TRAVELLER_IDS.trip+'/adopt',{requestId:randomUUID(),expectedRevision:before.revision,guideId:x.guideId,version:1});assert.equal(r.body.code,'RESTRICTED');assert.deepEqual(x.h('GET','/api/trips/'+TRAVELLER_IDS.trip).body.data,before);
});
test('revocation preserves traveller notes and own blocks; share then revoke remains original',async()=>{
 const x=await setup(),path='/api/trips/'+TRAVELLER_IDS.trip;let trip=x.h('GET',path).body.data;let r=x.h('POST',path+'/adopt',{requestId:randomUUID(),expectedRevision:trip.revision,guideId:x.guideId,version:1});assert.equal(r.body.ok,true);trip=r.body.data;
 const imported=trip.days.at(-1).stops[0],own=trip.days[0].stops[0];r=x.h('POST',path+'/commands',{requestId:randomUUID(),expectedRevision:trip.revision,command:{type:'updateStop',id:imported.id,patch:{travellerNote:'PRIVATE_NOTE_MUST_REMAIN'}}});assert.equal(r.body.ok,true);
 const share=x.h('POST','/api/shares',{requestId:randomUUID(),tripId:trip.id,stopIds:[own.id,imported.id],mediaIds:[],expiresAt:new Date(Date.now()+86400000).toISOString()});assert.equal(share.body.ok,true);const token=share.body.data.url.split('/').at(-1),shareRecord=x.publicShares.get(token);
 let grants=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants;const publicGrant=grants.find(g=>g.purpose==='public_guide');await x.check(cmd('revokeContentUse',publicGrant.id,{},publicGrant.grantVersion));
 const pub=x.h('GET','/api/guides/'+x.guideId);assert.ok(JSON.stringify(pub.body).includes('OWN_BLOCK_REMAINS'));assert.ok(!JSON.stringify(pub.body).includes(JSON.stringify(x.source.text).slice(1,-1)));
 const privateGrant=grants.find(g=>g.purpose==='trip_adoption');await x.check(cmd('revokeContentUse',privateGrant.id,{},privateGrant.grantVersion));const privateRead=x.h('GET',path).body.data;assert.ok(JSON.stringify(privateRead).includes('PRIVATE_NOTE_MUST_REMAIN'));assert.ok(!JSON.stringify(privateRead).includes(JSON.stringify(x.source.text).slice(1,-1)));
 const sharing=grants.find(g=>g.purpose==='trip_share');await x.check(cmd('revokeContentUse',sharing.id,{},sharing.grantVersion));const publicRead=shareRecord.readProjection();assert.ok(!JSON.stringify(publicRead).includes(JSON.stringify(x.source.text).slice(1,-1)));assert.ok(!JSON.stringify(publicRead).includes('PRIVATE_NOTE_MUST_REMAIN'));assert.equal(x.h('DELETE','/api/shares/'+share.body.data.id,{}).body.ok,true);assert.equal(shareRecord.state,'revoked');
});
test('no permission change or stale source can bypass original publish preparation',async()=>{
 const x=await setup(),g=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants.find(g=>g.purpose==='public_guide');await x.check(cmd('revokeContentUse',g.id,{},g.grantVersion));const r=x.h('POST','/api/studio/commands',{requestId:randomUUID(),expectedRevision:0,payload:{targetId:randomUUID(),kind:'prepareGuidePublish',data:{guideId:x.guideId,expectedGuideRevision:2,domainRequestId:randomUUID(),confirmed:true}}});assert.equal(r.body.code,'RESTRICTED');
});
test('original merchant membership revocation also closes discovery receipts and writes',async()=>{
 const x=await setup(),state=(await x.b.read({kind:'companyOffers',companyId:company})).data,p=state.publications[0],intent=cmd('withdrawOffer',p.id,{},p.revision);
 x.h('POST','/__preview/merchant/membership',{companyId:company,role:'marketing'});
 assert.equal((await x.b.command(intent)).code,'FORBIDDEN');assert.equal((await x.b.read({kind:'companyOffers',companyId:company})).data.canManage,false);
});
test('C2 reports revoked publication use as source changed while private brief grant remains',async()=>{
 const x=await setup(),g=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants.find(g=>g.purpose==='public_guide');await x.check(cmd('revokeContentUse',g.id,{},g.grantVersion));const draft=x.h('GET','/api/creator/guides/'+x.guideId);assert.equal(draft.body.ok,true);assert.equal(draft.body.data.sourceChanged,true);assert.equal(draft.body.data.studio.restricted,true);
});
test('confirmation edits cannot bypass completeness checks at original publication writer',async()=>{
 const x=await setup(),current=x.h('GET','/api/creator/guides/'+x.guideId).body.data,payload=structuredClone(current.payload);payload.summary='';const prep=x.studio('prepareGuideSave',randomUUID(),{artifactId:current.studio.artifactId,artifactRevision:1,selectedBlockIds:[x.source.id,...[]],guideId:x.guideId,expectedGuideRevision:2,domainRequestId:randomUUID(),editedPayload:payload,confirmed:true}).value;
 assert.equal(x.h('PUT','/api/creator/guides/'+x.guideId,{requestId:prep.domainRequestId,expectedRevision:2,payload}).body.ok,true);
 const publish=x.studio('prepareGuidePublish',randomUUID(),{guideId:x.guideId,expectedGuideRevision:3,domainRequestId:randomUUID(),confirmed:true}).value;
 assert.equal(x.h('POST','/api/creator/guides/'+x.guideId+'/publish',{requestId:publish.domainRequestId,expectedRevision:3}).body.code,'INVALID');
});

test('stored T2 and T3 briefs and recovery intents stop exposing revoked licensed previews',async()=>{
 const x=await setup(),tripPath='/api/trips/'+TRAVELLER_IDS.trip,guide=x.h('GET','/api/guides/'+x.guideId).body.data;
 let trip=x.h('GET',tripPath).body.data;trip=x.h('POST',tripPath+'/adopt',{requestId:randomUUID(),expectedRevision:trip.revision,guideId:x.guideId,version:1}).body.data;
 const ownerId=x.h('GET','/api/session').body.data.id,stop=trip.days.at(-1).stops[0];
 const briefs=[['T2','trip_adoption',{kind:'adopt',requestId:randomUUID(),tripId:trip.id,guideId:guide.id,guide}],['T3','trip_share',{kind:'share',requestId:randomUUID(),intent:{stopIds:[stop.id]},projection:{text:x.source.text}}]];
 for(const [templateId,purpose,operation]of briefs){
  const brief={id:randomUUID(),ownerId,visibility:'private',templateId,tripId:trip.id,tripRevision:trip.revision,guideId:guide.id,guideVersion:1,operations:[operation]};
  for(const kind of ['intents','briefs'])assert.equal(x.h('POST','/__preview/traveller/'+kind,brief).body.ok,true);
  const grant=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants.find(g=>g.purpose===purpose);await x.check(cmd('revokeContentUse',grant.id,{},grant.grantVersion));
  for(const kind of ['intents','briefs'])assert.equal(x.h('GET','/__preview/traveller/'+kind+'/'+brief.id).body.code,'RESTRICTED',templateId+' '+kind);
  assert.ok(!JSON.stringify(x.h('GET','/__preview/traveller/briefs').body).includes(JSON.stringify(x.source.text).slice(1,-1)));
 }
});

test('pending merchant command is inaccessible after original company membership revocation',async()=>{
 const x=await setup(),publication=(await x.b.read({kind:'companyOffers',companyId:company})).data.publications[0];
 const pending=cmd('withdrawOffer',publication.id,{},publication.revision);await x.b.stage(pending);assert.equal((await x.b.pending()).requestId,pending.requestId);
 x.h('POST','/__preview/merchant/membership',{companyId:company,role:'marketing'});
 await assert.rejects(()=>x.b.pending(),/FORBIDDEN/);
});

test('inseparable licensed-only guide is restricted on withdrawal without mutating its version',async()=>{
 const x=await setup({onlyLicensed:true}),before=structuredClone(x.published);
 const grant=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants.find(g=>g.purpose==='public_guide');await x.check(cmd('revokeContentUse',grant.id,{},grant.grantVersion));
 assert.equal(x.h('GET','/api/guides/'+x.guideId).body.code,'RESTRICTED');assert.deepEqual(x.published,before);
});

test('review: append-message receipt and replay cannot return revoked private thread sources',async()=>{
 const x=await setup(),thread=x.h('GET','/api/studio/threads/'+x.threadId).body.data;
 const saved=x.studio('appendMessage',x.threadId,{body:'討論已選證據',sourceIds:[x.source.id]},thread.revision);
 assert.equal(saved.value.sources.find(s=>s.id===x.source.id).text,x.source.text);
 const g=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants.find(g=>g.purpose==='private_brief');await x.check(cmd('revokeContentUse',g.id,{},g.grantVersion));
 assert.equal(x.h('GET','/api/studio/requests/'+saved.body.requestId).body.data.status,'restricted');assert.equal(x.h('POST','/api/studio/commands',saved.body).body.code,'RESTRICTED');
});

test('review: stale failed validation blocks original adoption and sharing without partial writes',async()=>{
 const original=Date.now;let clock=original();Date.now=()=>clock;
 try{const x=await setup(),path='/api/trips/'+TRAVELLER_IDS.trip;let trip=x.h('GET',path).body.data;
  trip=x.h('POST',path+'/adopt',{requestId:randomUUID(),expectedRevision:trip.revision,guideId:x.guideId,version:1}).body.data;
  const stop=trip.days.at(-1).stops[0],dayCount=trip.days.length;clock+=61000;x.b.sme.principal.active=false;
  await x.h.before('POST',path+'/adopt');assert.equal(x.h('POST',path+'/adopt',{requestId:randomUUID(),expectedRevision:trip.revision,guideId:x.guideId,version:1}).body.code,'RESTRICTED');
  await x.h.before('POST','/api/shares');assert.equal(x.h('POST','/api/shares',{requestId:randomUUID(),tripId:trip.id,stopIds:[stop.id],mediaIds:[],expiresAt:new Date(clock+86400000).toISOString()}).body.code,'RESTRICTED');
  assert.equal(x.h('GET',path).body.data.days.length,dayCount);assert.equal(x.publicShares.size,0);
 }finally{Date.now=original;}
});

test('review: licensed public summary is redacted while independent own stops survive',async()=>{
 const x=await setup({licensedMetadata:true}),g=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants.find(g=>g.purpose==='public_guide');
 assert.equal(x.h('GET','/api/guides/'+x.guideId).body.data.summary,x.source.text);await x.check(cmd('revokeContentUse',g.id,{},g.grantVersion));
 const value=x.h('GET','/api/guides/'+x.guideId).body.data;assert.notEqual(value.summary,x.source.text);assert.notEqual(value.title,x.source.title);assert.notEqual(value.days[0].title,x.source.title);assert.ok(value.days.some(d=>d.stops.some(s=>s.description==='OWN_BLOCK_REMAINS')));
});

test('review: licensed day headings retain bindings through adoption and sharing',async()=>{
 const x=await setup({licensedMetadata:true}),path='/api/trips/'+TRAVELLER_IDS.trip;let trip=x.h('GET',path).body.data;
 trip=x.h('POST',path+'/adopt',{requestId:randomUUID(),expectedRevision:trip.revision,guideId:x.guideId,version:1}).body.data;
 const day=trip.days.at(-1),own=day.stops.find(s=>s.sourceDescription==='OWN_BLOCK_REMAINS');assert.equal(day.title,x.source.title);
 const shared=x.h('POST','/api/shares',{requestId:randomUUID(),tripId:trip.id,stopIds:[own.id],mediaIds:[],expiresAt:new Date(Date.now()+86400000).toISOString()});assert.equal(shared.body.ok,true);
 const record=x.publicShares.get(shared.body.data.url.split('/').at(-1)),grants=(await x.b.read({kind:'companyOffers',companyId:company})).data.grants;
 for(const purpose of ['trip_adoption','trip_share']){const g=grants.find(g=>g.purpose===purpose);await x.check(cmd('revokeContentUse',g.id,{},g.grantVersion));}
 assert.notEqual(x.h('GET',path).body.data.days.at(-1).title,x.source.title);const value=record.readProjection();assert.notEqual(value.days[0].title,x.source.title);assert.equal(value.days[0].stops[0].description,'OWN_BLOCK_REMAINS');
});
