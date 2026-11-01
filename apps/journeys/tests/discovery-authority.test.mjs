import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoveryModule} from './helpers/discovery-load.mjs';
const mod=await discoveryModule('native-authority');
const actor='11111111-1111-4111-8111-111111111111', target='22222222-2222-4222-8222-222222222222';
const intent={requestId:actor,targetId:target,expectedRevision:1,command:{kind:'confirmLink',data:{proof:'EXAMPLE',readRefreshAllowed:true}}};
const now=Date.parse('2026-11-01T00:00:00Z'), key=new Uint8Array(32).fill(7);
const context={actorId:actor,identity:'scope-1',kind:'confirmLink',targetId:target};
test('authority signs only server observations bound to actor, command digest and short deadline',async()=>{
 const authority=mod.createCommandAuthority({clock:()=>now,identity:async()=>actor,context:async()=>context,observe:async()=>({proofId:target,workspaceId:'sample',scopeVersion:1}),key:async()=>({id:'example',secret:key})});
 const result=await authority(intent);assert.equal(result.ok,true);
 const payload=await mod.verifyCommandAuthority(result.envelope,{actorId:actor,intent,now,key});assert.equal(payload.facts.workspaceId,'sample');
 for(const changed of [{...intent,targetId:actor},{...intent,expectedRevision:2},{...intent,requestId:target}])await assert.rejects(mod.verifyCommandAuthority(result.envelope,{actorId:actor,intent:changed,now,key}));
 await assert.rejects(mod.verifyCommandAuthority(result.envelope,{actorId:target,intent,now,key}));
 await assert.rejects(mod.verifyCommandAuthority(result.envelope,{actorId:actor,intent,now:now+60001,key}));
 await assert.rejects(mod.verifyCommandAuthority({...result.envelope,signature:'0'.repeat(64)},{actorId:actor,intent,now,key}));
});
test('membership/scope changes during observation fail closed without signing',async()=>{
 let calls=0,keys=0;
 const authority=mod.createCommandAuthority({clock:()=>now,identity:async()=>actor,context:async()=>({...context,identity:++calls===1?'before':'after'}),observe:async()=>({}),key:async()=>{keys++;return {id:'example',secret:key};}});
 assert.equal((await authority(intent)).code,'RESTRICTED');assert.equal(keys,0);
});
test('missing integration, stale verification and unknown identity never authorize',async()=>{
 assert.equal((await mod.closedCommandAuthority(intent)).code,'NOT_CONNECTED');
 const base={clock:()=>now,identity:async()=>actor,context:async()=>context,observe:async()=>{throw Error('private credential');},key:async()=>null};
 const r=await mod.createCommandAuthority(base)(intent);assert.equal(r.ok,false);assert.equal(JSON.stringify(r).includes('credential'),false);
});
test('native RPC forwards attestation only from server port; retries retain request UUID',async()=>{
 const native=await discoveryModule('native');const calls=[];
 const authority=mod.createCommandAuthority({clock:()=>now,identity:async()=>actor,context:async()=>context,observe:async()=>({proofId:target}),key:async()=>({id:'example',secret:key})});
 const api=native.createNativeDiscovery({enabled:()=>true,authority,rpc:async(n,a)=>{if(n==='get_kinnso_discovery_request')return {data:{status:'unknown'},error:null};calls.push(a);throw Error('timeout');}});
 for(let i=0;i<2;i++)assert.equal((await api.command(intent)).code,'TIMEOUT');
 assert.equal(calls.length,2);assert.equal(calls[0].p_request_id,calls[1].p_request_id);assert.ok(calls[0].p_authority.signature);
 assert.equal((await api.command({...intent,authority:{approved:true}})).code,'INVALID');
});
