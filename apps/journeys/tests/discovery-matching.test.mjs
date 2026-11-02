import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {discoveryModule} from './helpers/discovery-load.mjs';import {publishedFixture,cmd,now,actor} from './helpers/discovery-fixture.mjs';
const m=await discoveryModule('matching');
const intent={id:randomUUID(),ownerActorId:actor,revision:1,cityKey:'city:hk:hong-kong',dateSpec:{kind:'fixed',start:'2026-11-07',end:'2026-11-09'},budget:{currency:'HKD',maxPerPersonMinor:20000},interestTags:['散步'],languages:['zh-HK'],status:'active'};
test('matching exists',()=>assert.equal(typeof m.evaluateOffer,'function'));
test('excludes city date expiry and explicit over budget; no unknown rights text',async()=>{
 const {b,publicationId}=await publishedFixture(),offer=b.context(publicationId);
 assert.equal(m.evaluateOffer(intent,offer,new Date(now())).score,100);
 for(const modified of [{...intent,cityKey:'different'},{...intent,dateSpec:{kind:'fixed',start:'2027-03-01',end:'2027-03-02'}},{...intent,budget:{currency:'HKD',maxPerPersonMinor:10}}])assert.equal(m.evaluateOffer(modified,offer,new Date(now())).eligibility,'excluded');
 const result=m.evaluateOffer(intent,{...offer,grants:[]},new Date(now()));assert.equal(result.eligibility,'excluded');assert.equal(result.display,undefined);
 assert.equal(m.evaluateOffer(intent,{...offer,sourceState:'expired'},new Date(now())).eligibility,'excluded');
});
test('unknown_currency_is_pending_not_zero; decimals are exact; inclusive local day',async()=>{
 assert.equal(m.priceMinor('128.50'),12850);assert.equal(m.priceMinor('0.29'),29);assert.equal(m.priceMinor(null),null);assert.throws(()=>m.priceMinor('1.001'),/INVALID/);
 const {b,publicationId}=await publishedFixture(),offer=b.context(publicationId);
 const other={...offer,import:{...offer.import,fields:{...offer.import.fields,currency:'TWD'}}};assert.equal(m.evaluateOffer(intent,other,new Date(now())).eligibility,'needs_confirmation');
 const undecided=m.evaluateOffer({...intent,dateSpec:{kind:'undecided'}},offer,new Date(now()));assert.equal(undecided.eligibility,'needs_confirmation');assert.ok(undecided.missing.length);
 for(const [time,allowed]of [['2027-01-31T15:59:59Z',true],['2027-01-31T16:00:00Z',false]]){const fresh={...offer,checkedAt:time};assert.equal(m.evaluateOffer({...intent,dateSpec:{kind:'fixed',start:'2027-01-31',end:'2027-01-31'}},fresh,new Date(time)).eligibility!=='excluded',allowed);}
});
test('partial dates explain 15 points; deterministic stable sorting; dismiss scope and bounded coverage',async()=>{
 const {b,publicationId}=await publishedFixture(),offer=b.context(publicationId);
 const partial=m.evaluateOffer({...intent,dateSpec:{kind:'fixed',start:'2026-10-31',end:'2026-11-02'}},offer,new Date(now()));assert.equal(partial.scoreBreakdown.dates,15);
 const offers=Array.from({length:105},(_,i)=>{const id=String(i).padStart(3,'0');return {...offer,publication:{...offer.publication,id},grants:offer.grants.map(g=>({...g,publicationId:id}))};});
 const r=m.rankOffers(intent,offers,[],new Date(now()));assert.equal(r.results.length,100);assert.equal(r.coverage.bounded,true);assert.equal(r.results[0].publicationId,'000');
 const choice={ownerActorId:actor,intentId:intent.id,publicationId,choice:'dismissed'};assert.equal(m.rankOffers(intent,[offer],[choice],new Date(now())).results.length,0);assert.equal(m.rankOffers({...intent,id:randomUUID()},[offer],[choice],new Date(now())).results.length,1);
});
test('recordMatch scores on server and delete clears saved matches',async()=>{
 const {b,check}=await publishedFixture(),id=randomUUID(),run=randomUUID();const {id:_unused,ownerActorId:_ownerActorId,revision:_revision,status:_status,...data}=intent;
 await check(cmd('saveIntent',id,data));await check(cmd('recordMatch',run,{intentId:id,intentRevision:1}));const r=await b.read({kind:'match',id:run});assert.equal(r.data.results[0].score,100);
 await check(cmd('deleteIntent',id,{},1));assert.equal((await b.read({kind:'match',id:run})).code,'NOT_FOUND');
});

test('campaign visibility is separate from matching and commission never changes ranking',async()=>{
 const {b,publicationId}=await publishedFixture(),offer=b.context(publicationId),campaignId=randomUUID();
 const hidden={...offer,publication:{...offer.publication,campaignId},campaignEligible:false};
 assert.equal(m.evaluateOffer(intent,hidden,new Date(now())).campaignId,undefined);
 const open=m.evaluateOffer(intent,{...hidden,campaignEligible:true},new Date(now()));assert.equal(open.campaignId,campaignId);
 assert.equal(open.participantStatus,undefined);
 assert.deepEqual(m.rankOffers(intent,[offer],[],new Date(now())),m.rankOffers(intent,[{...offer,commissionPercentage:99,affiliateIncome:999999}],[],new Date(now())));
});
