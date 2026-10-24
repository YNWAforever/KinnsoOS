import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNonProductionTarget} from '../scripts/verify-kinnso-target.ts';
import {runtimeFixture} from '../apps/journeys/tests/helpers/target-runtime.mjs';
test('root CI canonical container IDs resolve to the exact attested v3 container',()=>{
 const f=runtimeFixture('kinnso-v3');
 f.containers[1].NetworkSettings.Ports['8000/tcp'][0].HostPort='54421';
 const run=(command,args)=>{
  if(args[0]==='inspect'&&args.length===2)return JSON.stringify([f.containers.find(row=>row.Id.startsWith(args[1]))]);
  return f.run(command,args);
 };
 for(const reference of [f.containers[0].Id,f.containers[0].Id.slice(0,12)]){
  const result=assertNonProductionTarget({CI:'true',KINNSO_TEST_TARGET:'local',KINNSO_TEST_PROJECT:'kinnso-v3',SUPABASE_URL:'http://127.0.0.1:54421',SUPABASE_DB_CONTAINER:reference},run);
  assert.equal(result.identity.dbId,f.containers[0].Id);
 }
});
test('a container ID resolving to another project cannot authorize root fixtures',()=>{
 const f=runtimeFixture('kinnso-v3');
 assert.throws(()=>assertNonProductionTarget({CI:'true',KINNSO_TEST_TARGET:'local',KINNSO_TEST_PROJECT:'kinnso-v3',SUPABASE_URL:'http://127.0.0.1:54421',SUPABASE_DB_CONTAINER:f.containers[1].Id},()=>JSON.stringify([f.containers[1]])),/BLOCKED/);
});
