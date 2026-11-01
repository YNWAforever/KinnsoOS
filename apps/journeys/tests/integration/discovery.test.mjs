// FUTURE DISPOSABLE-DB SUITE. Never applies migrations or enables database gates.
// This turn runs it only in the default SKIP mode; no fixture/credentials are imported.
import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {discoveryModule} from '../helpers/discovery-load.mjs';
const authorized=process.env.KINNSO_DISCOVERY_DB_TEST_AUTHORIZED==='disposable-target-explicitly-approved';
const skip=authorized?false:'BLOCKED: no migration application or disposable DB authorized';
const call=async(actor,args)=>actor.client.rpc('apply_kinnso_discovery_command',args);
const args=(id,revision,requestId,kind,data)=>({p_target_id:id,p_expected_revision:revision,p_request_id:requestId,p_command:{kind,data}});
const sample={cityKey:'city:hk:hong-kong',dateSpec:{kind:'fixed',start:'2026-11-01',end:'2026-11-02'},budget:null,interestTags:[],languages:['zh-HK']};
async function fixture(){
 const target=new URL(process.env.SUPABASE_URL??'http://invalid');
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'This candidate suite only accepts an explicitly approved loopback disposable DB');
 return (await import('./local-fixtures.mjs')).fixture();
}
test('N01 DB: private intent isolation, direct RLS denial, deletion/tombstone and digest parity',{skip},async()=>{
 const f=await fixture();try{
  const a=await f.actor(),b=await f.actor(),id=randomUUID(),request=randomUUID(),input=args(id,0,request,'saveIntent',sample);
  const result=await call(a,input);assert.equal(result.error,null);assert.equal(result.data.receipt.revision,1);
  const {commandDigest}=await discoveryModule('policy');assert.equal(result.data.receipt.commandDigest,await commandDigest({requestId:request,targetId:id,expectedRevision:0,command:input.p_command}));
  assert.ok((await b.client.rpc('read_kinnso_discovery',{p_scope:{kind:'intent',id}})).error);
  for(const table of ['trip_intents','discovery_preferences','studio_source_grants','offer_imports'])assert.ok((await a.client.from(table).select('*')).error);
  assert.equal((await call(a,args(id,1,randomUUID(),'deleteIntent',{}))).error,null);
  const receipt=await a.client.rpc('get_kinnso_discovery_request',{p_request_id:request});assert.equal(receipt.data.resourceState,'deleted');
  assert.deepEqual((await call(a,input)).data,result.data);
  assert.ok((await call(a,args(id,0,randomUUID(),'saveIntent',sample))).error);
 }finally{await f.cleanup();}
});
test('N01 DB: concurrent same UUID is idempotent, edits conflict, invalid commands roll back',{skip},async()=>{
 const f=await fixture();try{
  const a=await f.actor(),id=randomUUID(),request=randomUUID(),input=args(id,0,request,'saveIntent',sample);
  const result=await Promise.all([call(a,input),call(a,input)]);assert.equal(result[0].error,null);assert.equal(result[1].error,null);assert.deepEqual(result[0].data,result[1].data);
  assert.ok((await call(a,{...input,p_command:{kind:'saveIntent',data:{...sample,interestTags:['changed']}}})).error);
  const invalid=randomUUID();assert.ok((await call(a,args(randomUUID(),0,invalid,'saveIntent',{...sample,dateSpec:{kind:'fixed',start:'2026-02-30',end:'2026-03-01'}}))).error);
  assert.equal((await a.client.rpc('get_kinnso_discovery_request',{p_request_id:invalid})).data.status,'unknown');
 }finally{await f.cleanup();}
});
test('N01 DB: external authority is unavailable and existing own studio remains separate',{skip},async()=>{
 const f=await fixture();try{const a=await f.actor(true);
  for(const kind of ['confirmLink','importOffer','grantContentUse','publishOffer','recordMatch'])assert.ok((await call(a,args(randomUUID(),0,randomUUID(),kind,{}))).error);
  const r=await a.client.rpc('apply_kinnso_studio_command',{p_target_id:randomUUID(),p_expected_revision:0,p_request_id:randomUUID(),p_command:{kind:'createThread',title:'Synthetic compatibility',topic:'creation',templateId:'C1'}});assert.equal(r.error,null);
 }finally{await f.cleanup();}
});
test('N review DB: deleting a colliding intent cannot block another actor preferences',{skip},async()=>{
 const f=await fixture();try{const a=await f.actor(),b=await f.actor();
  assert.equal((await call(a,args(b.id,0,randomUUID(),'saveIntent',sample))).error,null);
  assert.equal((await call(a,args(b.id,1,randomUUID(),'deleteIntent',{}))).error,null);
  const request=randomUUID();assert.equal((await call(b,args(b.id,0,request,'clearPreferences',{}))).error,null);
  assert.equal((await b.client.rpc('get_kinnso_discovery_request',{p_request_id:request})).data.resourceState,'present');
 }finally{await f.cleanup();}
});
test('N review DB: concurrent different-target creates cannot exceed 100 intents',{skip},async()=>{
 const f=await fixture();try{const a=await f.actor();for(let i=0;i<99;i++)assert.equal((await call(a,args(randomUUID(),0,randomUUID(),'saveIntent',sample))).error,null);
  const results=await Promise.all([call(a,args(randomUUID(),0,randomUUID(),'saveIntent',sample)),call(a,args(randomUUID(),0,randomUUID(),'saveIntent',sample))]);
  assert.equal(results.filter(r=>!r.error).length,1);assert.match(results.find(r=>r.error).error.message,/invalid_discovery_limit/);
  assert.equal((await a.client.rpc('read_kinnso_discovery',{p_scope:{kind:'intents'}})).data.data.length,100);
 }finally{await f.cleanup();}
});
