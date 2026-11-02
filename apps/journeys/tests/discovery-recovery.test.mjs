import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {discoveryModule} from './helpers/discovery-load.mjs';import {backend,cmd,actor,now,publishedFixture} from './helpers/discovery-fixture.mjs';
const {verifyDiscoveryCommand}=await discoveryModule('store');
const data={cityKey:'city:hk:hong-kong',dateSpec:{kind:'undecided'},budget:null,interestTags:[],languages:[]};
test('verified command exists',()=>assert.equal(typeof verifyDiscoveryCommand,'function'));
test('lost_ack_replays_same_receipt and does not duplicate intent',async()=>{
 const b=backend({actorId:actor,now}),c=cmd('saveIntent',randomUUID(),data);let first=true;
 const store={...b,command:async i=>{const r=await b.command(i);if(first){first=false;throw Error('connection dropped');}return r;}};
 assert.equal((await verifyDiscoveryCommand(store,c)).status,'complete');const receipt=await b.receipt(c.requestId);assert.equal((await verifyDiscoveryCommand(store,c)).receipt.requestId,receipt.receipt.requestId);assert.equal((await b.read({kind:'intents'})).data.length,1);
});
test('request not sent is unknown; same frozen UUID is kept for retry',async()=>{
 const b=backend({actorId:actor,now}),c=cmd('saveIntent',randomUUID(),data);assert.equal((await verifyDiscoveryCommand({...b,command:async()=>{throw Error();}},c)).status,'unknown');assert.deepEqual(await b.pending(),c);
 assert.equal((await verifyDiscoveryCommand(b,{...c,command:{kind:'saveIntent',data:{...data,interestTags:['changed']}}})).status,'conflict');assert.equal((await verifyDiscoveryCommand(b,c)).status,'complete');
});
test('readback mismatch stays unknown; revoked scope returns no body',async()=>{
 const b=backend({actorId:actor,now}),c=cmd('saveIntent',randomUUID(),data);let reads=0;const store={...b,receipt:async id=>{const r=await b.receipt(id);return ++reads===2?{...r,receipt:{...r.receipt,revision:999}}:r;}};
 assert.equal((await verifyDiscoveryCommand(store,c)).status,'unknown');
 const guest=backend({actorId:null,now});assert.deepEqual(await guest.receipt(c.requestId),{status:'restricted',requestId:c.requestId});
});
test('deleted old UUID cannot resurrect body; reset cannot claim durable save',async()=>{
 const b=backend({actorId:actor,now}),c=cmd('saveIntent',randomUUID(),data);await verifyDiscoveryCommand(b,c);await b.command(cmd('deleteIntent',c.targetId,{},1));assert.equal((await verifyDiscoveryCommand(b,c)).status,'deleted');
 assert.equal((await backend({actorId:actor,now}).receipt(c.requestId)).status,'unknown');
});
test('freshness requires delegation; stale blocked until explicit owner refresh',async()=>{
 let clock=now();const {b,publicationId}=await publishedFixture({now:()=>clock});assert.equal(await b.ensureFresh(publicationId),true);
 clock+=61000;b.sme.principal.active=false;assert.equal(await b.ensureFresh(publicationId),false);
});

test('review: staging timeout while retrying an unknown write preserves the same UUID',async()=>{
 const b=backend({actorId:actor,now}),c=cmd('saveIntent',randomUUID(),data);
 assert.equal((await verifyDiscoveryCommand({...b,command:async i=>{await b.command(i);throw Error('TIMEOUT');},receipt:async()=>{throw Error('TIMEOUT');}},c)).status,'unknown');
 assert.equal((await verifyDiscoveryCommand({...b,stage:async()=>{throw Error('TIMEOUT');}},c)).status,'unknown');
 assert.deepEqual(await b.pending(),c);assert.equal((await verifyDiscoveryCommand(b,c)).receipt.requestId,c.requestId);assert.equal((await b.read({kind:'intents'})).data.length,1);
});
