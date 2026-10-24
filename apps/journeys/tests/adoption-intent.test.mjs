import test from 'node:test';
import assert from 'node:assert/strict';
const intent=await import('../lib/guides/adoption-intent.ts').catch(()=>({}));
const guide='11111111-1111-4111-8111-111111111111',trip='22222222-2222-4222-8222-222222222222',flow='33333333-3333-4333-8333-333333333333';
test('the reviewed source version and opaque creation receipt survive validated trip returns',()=>{
 const next=intent.adoptionPath('en',guide,undefined,flow,3,trip);
 assert.equal(intent.parseAdoptionPath(next,'en').version,3);
 assert.equal(intent.parseAdoptionPath(next,'en').creationId,trip);
 const returned=intent.afterTripCreation(next,trip,'en');
 assert.equal(intent.parseAdoptionPath(returned,'en').version,3);
 for(const suffix of ['&version=0','&version=1.5','&version=1&version=2','&creation=nope'])assert.equal(intent.parseAdoptionPath(`/en/g/${guide}?adopt=1`+suffix,'en'),null);
});
test('login and new-trip handoffs return to the exact guide preview without confirming adoption',()=>{
 assert.equal(typeof intent.adoptionPath,'function');
 const next=intent.adoptionPath('zh-HK',guide,undefined,flow);
 assert.equal(next,`/zh-HK/g/${guide}?adopt=1&flow=${flow}`);
 assert.deepEqual(intent.parseAdoptionPath(next,'zh-HK'),{guideId:guide,tripId:null,flowId:flow});
 assert.equal(intent.afterTripCreation(next,trip,'zh-HK'),`/zh-HK/g/${guide}?adopt=1&trip=${trip}&flow=${flow}`);
});
test('return intent rejects foreign origins, locale changes, duplicate or extra parameters and non-UUID identities',()=>{
 assert.equal(typeof intent.parseAdoptionPath,'function');
 for(const next of [`https://evil.test/en/g/${guide}?adopt=1`,`//evil.test/en/g/${guide}?adopt=1`,`/en/g/${guide}?adopt=1`,`/zh-HK/g/${guide}?adopt=1&trip=other`,`/zh-HK/g/${guide}?adopt=1&adopt=1`,`/zh-HK/g/${guide}?adopt=1&confirm=1`,`/zh-HK/g/../../trips?adopt=1`,`/zh-HK/g/${guide}?adopt=1#confirm`]){
  assert.equal(intent.parseAdoptionPath(next,'zh-HK'),null,next);
 }
 assert.equal(intent.afterTripCreation('https://evil.test',trip,'en'),`/en/trips/${trip}`);
});
