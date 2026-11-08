import test from 'node:test';
import assert from 'node:assert/strict';
import {privateIntentFaultSql,parsePrivateIntentFault} from './private-rollback.mjs';
const requestId='11111111-1111-4111-8111-111111111111',actorId='22222222-2222-4222-8222-222222222222',
  targetId='33333333-3333-4333-8333-333333333333';
const spec={caseId:'intent_receipt_fault',requestId,actorId,targetId};
test('late receipt fault proves the intent was written in the same transaction before raising',()=>{
  const sql=privateIntentFaultSql(spec);
  assert(sql.includes('BEFORE INSERT ON kinnso_internal.discovery_requests'));
  assert(sql.includes('SECURITY DEFINER')&&sql.includes('REVOKE ALL ON FUNCTION'));
  assert(sql.includes('new.request_id')&&sql.includes('new.actor_id'));
  assert(sql.includes('FROM public.trip_intents')&&sql.includes('revision=1'));
  assert(sql.includes("DETAIL=jsonb_build_object(")&&sql.includes("'domainWritten',true"));
  assert(sql.includes('ERRCODE=\'P0001\''));
  assert.doesNotMatch(sql,/update auth\.|delete from public\.|drop table/i);
});
test('fault parser accepts only exact server marker, actor, request and prior domain write',()=>{
  const error={code:'P0001',message:'synthetic_native_fault:na_intent_receipt_fault',
    details:JSON.stringify({requestId,actorId,targetId,domainWritten:true})};
  assert.equal(parsePrivateIntentFault(error,spec).wroteBeforeFault,true);
  for(const delta of [{code:'08006'},{message:'arbitrary'},{details:null},{details:'broken'},
    {details:JSON.stringify({requestId,actorId,targetId,domainWritten:false})},
    {details:JSON.stringify({requestId:actorId,actorId,targetId,domainWritten:true})}]){
    assert.throws(()=>parsePrivateIntentFault({...error,...delta},spec),{code:'FAULT_NOT_PROVEN'});
  }
});
