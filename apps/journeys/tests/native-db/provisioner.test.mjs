import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createProvisionCommands,prepareOwnedRunDirectory} from './provisioner.mjs';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('provision commands create only new project-labelled resources in safe order',()=>{
  const plan={runId:'8bce2805-c3e8-44f5-831e-805be1727c96',project:'kinnsoos-native-acceptance-20261101',
    apiOrigin:'http://127.0.0.1:60021',ports:{api:60021,db:60022,shadow:60020}};
  const commands=createProvisionCommands(plan,path.resolve('.local-private/native-acceptance',plan.runId,'supabase'),'C:/cli/supabase.js');
  assert.deepEqual(commands.map(x=>x.args.slice(0,3)),[
    ['network','create','--internal'],
    ['volume','create','--label'],
    [commands[2].args[0],commands[2].args[1],commands[2].args[2]]
  ]);
  assert.match(JSON.stringify(commands[0]),/supabase_network_kinnsoos-native-acceptance-20261101/);
  assert.match(JSON.stringify(commands[0]),/org\.kinnso\.na\.run/);
  assert.match(JSON.stringify(commands[1]),/supabase_db_kinnsoos-native-acceptance-20261101/);
  assert.match(JSON.stringify(commands[2]),/--workdir/);
  assert.match(JSON.stringify(commands[2]),/analytics,edge-runtime,functions,imgproxy,inbucket,meta,realtime,storage,studio,vector/);
  assert.match(JSON.stringify(commands[2]),/--network-id/);
  assert.doesNotMatch(JSON.stringify(commands),/SUPABASE_ACCESS_TOKEN|DATABASE_URL|SERVICE_ROLE/);
});

test('provision commands reject port 3499 and malformed owned paths',()=>{
  const base={runId:'8bce2805-c3e8-44f5-831e-805be1727c96',project:'kinnsoos-native-acceptance-20261101',apiOrigin:'http://127.0.0.1:3499',ports:{api:3499,db:60022,shadow:60020}};
  assert.throws(()=>createProvisionCommands(base,'C:/private/run/supabase','C:/cli/supabase.js'),{code:'PROVISION_PLAN_INVALID'});
  assert.throws(()=>createProvisionCommands({...base,apiOrigin:'http://127.0.0.1:60021',ports:{api:60021,db:60022,shadow:60020}},'C:/Users/foreign','C:/cli/supabase.js'),{code:'PROVISION_PATH_INVALID'});
});
test('provision creates the owned run parent before nested supabase config and refuses an existing run',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'kinnso-provision-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const runId='8bce2805-c3e8-44f5-831e-805be1727c96',dir=await prepareOwnedRunDirectory(root,runId);
  assert.equal((await stat(dir)).isDirectory(),true);
  await assert.rejects(prepareOwnedRunDirectory(root,runId),{code:'RUN_DIRECTORY_ALREADY_EXISTS'});
});
