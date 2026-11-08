import test from 'node:test';
import assert from 'node:assert/strict';
import {privateCommandInput,runGateCase,runSameUuidCase,runOwnerReadIsolationCase} from './db-cases.mjs';
const ids={actor:'11111111-1111-4111-8111-111111111111',foreign:'22222222-2222-4222-8222-222222222222',intent:'33333333-3333-4333-8333-333333333333',request:'44444444-4444-4444-8444-444444444444'};

test('private command inputs use only approved example values',()=>{
  assert.deepEqual(privateCommandInput('savePreferences',ids.actor).p_command,{kind:'savePreferences',data:{favoriteCityKeys:['city:hk:hong-kong'],interestTags:['food'],languages:['zh-HK']}});
  assert.deepEqual(privateCommandInput('archiveIntent',ids.intent,1).p_command,{kind:'archiveIntent',data:{}});
  assert.throws(()=>privateCommandInput('publishOffer',ids.intent),{code:'PRIVATE_COMMAND_INVALID'});
});

test('closed gate rejection differs from successful private-only response and keeps UUID',async()=>{
  const calls=[];
  let revision=0;
  const snapshot=async()=>({revision});
  const input=privateCommandInput('saveIntent',ids.intent,0,ids.request);
  const closed=await runGateCase({client:{rpc:async(...args)=>{calls.push(args);return {data:null,error:{message:'discovery_unavailable'}};}},input,command:'saveIntent',target:ids.intent,expectedRevision:0,gate:'closed',snapshot});
  assert.equal(closed.status,'PASS');
  const open=await runGateCase({client:{rpc:async(...args)=>{calls.push(args);revision=1;return {data:{ok:true,receipt:{revision:1}},error:null};}},input,command:'saveIntent',target:ids.intent,expectedRevision:0,gate:'privateOnly',snapshot});
  assert.equal(open.status,'PASS');
  assert.equal(calls[0][1].p_request_id,calls[1][1].p_request_id);
});

test('same UUID helper requires identical result and one resource observation',async()=>{
  let count=0;const input=privateCommandInput('saveIntent',ids.intent),client={rpc:async()=>({data:{ok:true,receipt:{requestId:input.p_request_id,revision:1}},error:null})};
  const result=await runSameUuidCase({client,input,observe:async()=>({count:++count}),
    proveOverlap:async()=>({evidenceLevel:'DATABASE_OBSERVER',writerPid:10,waiterPid:11,requestId:input.p_request_id,query:'select apply_kinnso_discovery_command($1)'})});
  assert.equal(result.status,'PASS');
  const mismatch=privateCommandInput('saveIntent',ids.intent);
  await assert.rejects(runSameUuidCase({client:{rpc:async()=>({data:{ok:true,random:Math.random()},error:null})},input:mismatch,observe:async()=>({count:2}),
    proveOverlap:async()=>({evidenceLevel:'DATABASE_OBSERVER',writerPid:10,waiterPid:11,requestId:mismatch.p_request_id,query:'select apply_kinnso_discovery_command($1)'})}),{code:'UUID_RESULT_MISMATCH'});
});

test('foreign actor receipt and intent reads cannot disclose owner data',async()=>{
  const result=await runOwnerReadIsolationCase({
    owner:{rpc:async()=>({data:{ok:true,data:{id:ids.intent}},error:null})},
    foreign:{rpc:async()=>({data:null,error:{message:'discovery_not_found'}})},
    readRequest:async()=>({data:{status:'unknown'},error:null})
  },{intentId:ids.intent,requestId:ids.request});
  assert.equal(result.status,'PASS');
});
test('gate positive control uses the supplied command revision rather than assuming a new resource',async()=>{
  const input=privateCommandInput('archiveIntent',ids.intent,1,ids.request);let changed=false;
  const result=await runGateCase({input,gate:'privateOnly',
    client:{rpc:async()=>{changed=true;return {data:{ok:true,receipt:{revision:2}},error:null};}},
    snapshot:async()=>({revision:changed?2:1})});
  assert.equal(result.actual.revision,2);
});
