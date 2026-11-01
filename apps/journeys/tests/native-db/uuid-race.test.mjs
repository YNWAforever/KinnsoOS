import test from 'node:test';
import assert from 'node:assert/strict';
import {runUuidCreationRace,runUuidRaceMatrix} from './uuid-race.mjs';

const input={p_target_id:'11111111-1111-4111-8111-111111111111',p_expected_revision:0,
  p_request_id:'22222222-2222-4222-8222-222222222222',p_command:{kind:'saveIntent',data:{}}};
function fake(){
  const events=[],receipt={ok:true,receipt:{requestId:input.p_request_id,resourceId:input.p_target_id,revision:1}},sessions=[];
  let wake,pendingStarted=false,committed=false;
  const open=async index=>{
    const session={async begin(){events.push('begin'+index);},pid:()=>40+index,
      request:()=>({requestId:input.p_request_id,method:'apply_kinnso_discovery_command'}),
      async rpc(method,args){
        assert.equal(method,'apply_kinnso_discovery_command');assert.deepEqual(args,input);
        events.push('rpc'+index);
        if(index===1){pendingStarted=true;await new Promise(resolve=>{wake=resolve;});}
        return structuredClone(receipt);
      },
      async commit(){events.push('commit'+index);if(index===0){committed=true;wake?.();}},
      async rollback(){events.push('rollback'+index);wake?.();},
      async close(){events.push('close'+index);}
    };sessions.push(session);return session;
  };
  return {events,open,receipt,observe:async({writerPid,waiterPid})=>{
    assert(pendingStarted&&!committed,'observe must occur while second statement is blocked');
    assert.equal(writerPid,40);assert.equal(waiterPid,41);events.push('observe');
    return {pid:41,blockers:[40],waitEventType:'Lock',writerQueryMatches:true,waiterQueryMatches:true};
  },effects:async()=>({intentCount:1,receiptCount:1,intentRevision:1,receiptRevision:1}),sessions};
}
test('writer holds its transaction until a third observer proves the waiter is blocked',async()=>{
  const f=fake(),result=await runUuidCreationRace({input,openSession:f.open,observe:f.observe,effects:f.effects});
  assert.equal(result.receipt.requestId,input.p_request_id);
  assert.equal(result.proof.writerPid,40);assert.equal(result.proof.waiterPid,41);
  assert(f.events.indexOf('observe')<f.events.indexOf('commit0'));
  assert.deepEqual(f.events.slice(-2),['close0','close1']);
});
test('unrelated blocker, wrong writer query, or missing receipt/domain effects cannot pass',async()=>{
  for(const fault of ['blocker','query','effects']){
    const f=fake();
    await assert.rejects(runUuidCreationRace({input,openSession:f.open,
      observe:async args=>({...await f.observe(args),...(fault==='blocker'?{blockers:[99]}:fault==='query'?{writerQueryMatches:false}:{})}),
      effects:async()=>fault==='effects'?{intentCount:2,receiptCount:1,intentRevision:1,receiptRevision:1}:f.effects(),
      barrierMs:25}),e=>['OVERLAP_NOT_PROVEN','UUID_EFFECT_COUNT_MISMATCH'].includes(e.code));
    assert(f.events.includes('close0')&&f.events.includes('close1'));
  }
});
test('second result failure rolls back, cleans both sessions and cannot be hidden by the winner',async()=>{
  const f=fake(),open=async i=>{
    const session=await f.open(i);
    if(i===1){const rpc=session.rpc;session.rpc=async(...args)=>{await rpc(...args);throw Object.assign(Error('unknown'),{code:'SQL_RESULT_UNKNOWN'});};}
    return session;
  };
  await assert.rejects(runUuidCreationRace({input,openSession:open,observe:f.observe,effects:f.effects}),{code:'SQL_RESULT_UNKNOWN'});
  assert(f.events.includes('rollback1'));assert(f.events.includes('close1'));
});
test('a partial open failure cleans the first session',async()=>{
  const f=fake();
  await assert.rejects(runUuidCreationRace({input,openSession:async i=>{if(i===1)throw Error('open');return f.open(i);},
    observe:f.observe,effects:f.effects}),/open/);
  assert(f.events.includes('close0'));
});
test('matrix runs ten rounds in both worker orders and never collapses repeated attempts',async()=>{
  const seen=[];
  const result=await runUuidRaceMatrix({rounds:10,attempt:async({round,order})=>{seen.push([round,order]);return {receipt:{},proof:{},effects:{}};}});
  assert.equal(result.attempts.length,20);
  assert.equal(seen.filter(x=>x[1]==='A-first').length,10);
  assert.equal(seen.filter(x=>x[1]==='B-first').length,10);
});
