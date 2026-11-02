import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStageStore} from './stage-state.mjs';
import {executeStage} from '../../scripts/native-db-acceptance.mjs';
const runId='8bce2805-c3e8-44f5-831e-805be1727c96';
test('real file receipts from provision are consumed by migrate and run',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'na-state-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const store=createStageStore(root),plan={runId,sourceHash:'a'.repeat(64),migrationHash:'b'.repeat(64)};
  const topology={...plan,dbContainerId:'db1',networkId:'net1',volumeId:'vol1',imageDigests:{db:'c'.repeat(64)}},calls=[];
  const ports={load:async()=>plan,preflight:async()=>({status:'PREFLIGHT_PASS'}),readState:store.read,store:store.write,
    provision:async()=>({status:'STARTED'}),attestTopology:async()=>topology,
    replay:async()=>{calls.push('replay');return {status:'SCHEMA_READY'};}};
  assert.equal((await executeStage({stage:'provision',manifest:'test'},ports)).status,'PROVISION_READY');
  const receipt=await store.read(plan);
  assert.deepEqual(receipt.provision.topology,topology);
  assert.equal((await executeStage({stage:'migrate',manifest:'test'},ports)).status,'SCHEMA_READY');
  assert.deepEqual(calls,['replay']);
});
test('incomplete or foreign state is rejected instead of being reused',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'na-state-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const store=createStageStore(root),plan={runId};
  assert.deepEqual(await store.read(plan),{});
  await store.write(plan,{schema:{schemaHash:'a'.repeat(64)}});
  assert.equal((await store.read(plan)).runId,runId);
});
