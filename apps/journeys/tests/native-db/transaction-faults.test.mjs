import test from 'node:test';
import assert from 'node:assert/strict';
import {faultSql,runAtomicFaultCase,removeFaultSql} from './transaction-faults.mjs';

test('fault trigger is test-schema-only, target-scoped and removed by exact owned name',()=>{
  const install=faultSql({caseId:'NA06.restore',table:'public.guides',targetColumn:'id',targetValue:'11111111-1111-4111-8111-111111111111'});
  assert.match(install,/create schema if not exists kinnso_na_fault/);
  assert.match(install,/before insert or update or delete/);
  assert.match(install,/case when tg_op='DELETE' then to_jsonb\(old\) else to_jsonb\(new\) end/);
  assert.match(install,/NA06_restore/i);
  assert.doesNotMatch(install,/drop table|delete from public\./i);
  assert.match(removeFaultSql('NA06.restore','public.guides'),/drop trigger if exists/i);
});

test('rollback case requires identical effects after a real mid-write exception',async()=>{
  const calls=[];
  const result=await runAtomicFaultCase({
    install:async()=>calls.push('install'),baseline:async()=>({revision:1,rows:3}),action:async()=>{calls.push('action');throw Object.assign(Error('db failure'),{sqlState:'P0001',faultMarker:'synthetic_native_fault:NA06.restore',wroteBeforeFault:true});},
    snapshot:async()=>({revision:1,rows:3}),remove:async()=>calls.push('remove')
  });
  assert.equal(result.status,'PASS');assert.equal(result.failure.sqlState,'P0001');
  assert.deepEqual(calls,['install','action','remove']);
});

test('partial effect or leftover fault trigger blocks the rollback pass',async()=>{
  const fault={sqlState:'P0001',faultMarker:'synthetic_native_fault:case',wroteBeforeFault:true};
  await assert.rejects(runAtomicFaultCase({install:async()=>{},baseline:async()=>({revision:1}),action:async()=>{throw Object.assign(Error('x'),fault);},
    snapshot:async()=>({revision:2}),remove:async()=>{}}),{code:'PARTIAL_EFFECT_AFTER_ROLLBACK'});
  await assert.rejects(runAtomicFaultCase({install:async()=>{},baseline:async()=>({revision:1}),action:async()=>{throw Object.assign(Error('x'),fault);},
    snapshot:async()=>({revision:1}),remove:async()=>{throw Error('cleanup');}}),{code:'FAULT_CLEANUP_FAILED'});
});
test('network or unrelated errors cannot masquerade as the injected mid-write fault',async()=>{
  await assert.rejects(runAtomicFaultCase({install:async()=>{},baseline:async()=>({revision:1}),action:async()=>{throw Object.assign(Error('network'),{sqlState:'08006'});},
    snapshot:async()=>({revision:1}),remove:async()=>{}}),{code:'FAULT_NOT_PROVEN'});
  await assert.rejects(runAtomicFaultCase({install:async()=>{},baseline:async()=>({revision:1}),action:async()=>{throw Object.assign(Error('fault'),{sqlState:'P0001',faultMarker:'other',wroteBeforeFault:true});},
    snapshot:async()=>({revision:1}),remove:async()=>{},expectedMarker:'na_case'}),{code:'FAULT_NOT_PROVEN'});
});
