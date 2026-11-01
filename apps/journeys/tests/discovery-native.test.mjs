import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoveryModule} from './helpers/discovery-load.mjs';
const native=await discoveryModule('native');
const id='11111111-1111-4111-8111-111111111111';
const intent={requestId:id,targetId:'22222222-2222-4222-8222-222222222222',expectedRevision:0,command:{kind:'clearPreferences',data:{}}};
test('native boundary is present',()=>assert.equal(typeof native.createNativeDiscovery,'function'));
test('disabled writes never invoke RPC; owner minimal receipts survive disable',async()=>{
 const calls=[];const api=native.createNativeDiscovery({enabled:()=>false,rpc:async(name,args)=>{calls.push(name);return {data:{status:'complete',receipt:{requestId:id,commandDigest:'a'.repeat(64),resourceId:intent.targetId,revision:1},resourceState:'present',secret:'never return'},error:null};}});
 assert.equal((await api.command(intent)).code,'UNAVAILABLE');assert.equal(calls.length,0);
 const read=await api.receipt(id);assert.equal(read.status,'complete');assert.equal(JSON.stringify(read).includes('secret'),false);assert.deepEqual(calls,['get_kinnso_discovery_request']);
});
test('strict input, immutable UUID, transport unknown and no browser authority',async()=>{
 let captured;const api=native.createNativeDiscovery({enabled:()=>true,rpc:async(name,args)=>{captured={name,args};throw Error('secret-token');}});
 assert.equal((await api.command({...intent,role:'owner'})).code,'INVALID');assert.equal(captured,undefined);
 assert.equal((await api.command(intent)).code,'TIMEOUT');assert.equal(captured.args.p_request_id,id);assert.equal(captured.args.p_command.kind,'clearPreferences');
 assert.deepEqual(await api.receipt(id),{status:'unknown',requestId:id});
});
test('read allowlist and schema errors never escape as private backend errors',async()=>{
 let calls=0;const api=native.createNativeDiscovery({enabled:()=>true,rpc:async()=>{calls++;return {data:null,error:{message:'discovery_restricted private terms'}};}});
 assert.equal((await api.read({kind:'table',name:'auth.users'})).code,'INVALID');assert.equal(calls,0);
 assert.equal((await api.read({kind:'intents'})).code,'RESTRICTED');assert.equal((await api.receipt(id)).status,'restricted');
});
test('malformed success is unknown, not a saved receipt',async()=>{
 const api=native.createNativeDiscovery({enabled:()=>true,rpc:async()=>({data:{ok:true,receipt:{requestId:'other'}},error:null})});
 assert.equal((await api.command(intent)).code,'UNAVAILABLE');assert.equal((await api.receipt(id)).status,'unknown');
});
test('N review uppercase UUID is rejected before RPC rather than becoming an unrecoverable write',async()=>{
 let calls=0;const api=native.createNativeDiscovery({enabled:()=>true,rpc:async()=>{calls++;return {data:null,error:null};}});
 const upper={...intent,requestId:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'};
 assert.equal((await api.command(upper)).code,'INVALID');assert.equal(calls,0);
 const policy=await discoveryModule('policy');assert.throws(()=>policy.parseDiscoveryIntent(upper),/INVALID/);
});
test('N review source contract preserves upstream optional/multiline text and maximum exact decimal',async()=>{
 const contract=await discoveryModule('contracts','integrations/smeassistant'),matching=await discoveryModule('matching');
 const value={offerId:'sample',revision:1,hash:'a'.repeat(64),sourceLocationId:null,appliedLocationId:'sample-location',title:'Sample',details:'Line one\nLine two',terms:'',validFrom:'2026-11-01',validUntil:'2026-11-30',priceAmount:'9999999999.99',currency:'HKD',claims:['a'.repeat(200)],prohibitedTerms:[],observedAt:'2026-11-01T00:00:00Z',sourceStatus:'confirmed',rightsState:'unverified_for_kinnso_reuse'};
 assert.deepEqual(contract.parseOfferEvidence(value),value);assert.equal(matching.priceMinor(value.priceAmount),999999999999);
 assert.throws(()=>contract.parseOfferEvidence({...value,priceAmount:'10000000000.00'}),/INVALID/);
});
