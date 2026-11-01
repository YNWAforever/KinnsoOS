import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTopology,run} from './docker-runtime.mjs';
import {validateTopology} from './target.mjs';

const now=Date.now(),project='kinnsoos-native-acceptance-20261101';
const plan={version:1,approved:true,approvalSource:'user:NA01-NA09-local-only-20261101',runId:'8bce2805-c3e8-44f5-831e-805be1727c96',
 project,apiOrigin:'http://127.0.0.1:60021',ports:{api:60021,db:60022,shadow:60020},createdAt:new Date(now-60000).toISOString(),
 expiresAt:new Date(now+3600000).toISOString(),sourceHash:'a'.repeat(64),migrationHash:'b'.repeat(64),
 stages:['preflight','provision','migrate','run','cleanup-owned'],scopes:['new-local-stack','migrations','synthetic-fixtures','owned-fault-injection','owned-fixture-cleanup'],
 minimumFreeMemoryBytes:4*1024**3,minimumFreeDiskBytes:10*1024**3,cliVersion:'2.107.0',postgresMajor:17};
function fixture(){
  const created=new Date(now-30000).toISOString(),id=n=>n.repeat(64).slice(0,64);
  const names={db:'supabase_db_'+project,auth:'supabase_auth_'+project,rest:'supabase_rest_'+project,gateway:'supabase_kong_'+project};
  const row=(role,name,extra={})=>({Id:id(role[0]==='g'?'d':role[0]==='a'?'e':role[0]==='r'?'f':'c'),Name:'/'+name,Created:created,Image:'sha256:'+id(role==='db'?'1':role==='auth'?'2':role==='rest'?'3':'4'),
    State:{Running:true},Config:{Labels:{'com.supabase.cli.project':project},Env:role==='auth'?['GOTRUE_DB_DATABASE_URL=postgresql://postgres@'+names.db+':5432/postgres']:role==='rest'?['PGRST_DB_URI=postgresql://postgres@'+names.db+':5432/postgres']:[]},
    NetworkSettings:{Networks:{['supabase_network_'+project]:{NetworkID:'net1'}},Ports:role==='db'?{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'60022'}]}:role==='gateway'?{'8000/tcp':[{HostIp:'127.0.0.1',HostPort:'60021'}]}:{}},Mounts:role==='db'?[{Type:'volume',Name:'supabase_db_'+project,Destination:'/var/lib/postgresql/data'}]:[],...extra});
  const containers=[row('db',names.db),row('auth',names.auth),row('rest',names.rest),row('gateway',names.gateway)];
  return {containers,network:{Id:'net1',Internal:true,Created:created,Labels:{'org.kinnso.na.project':project,'org.kinnso.na.run':plan.runId},Containers:Object.fromEntries(containers.map(x=>[x.Id,{Name:x.Name}]))},
    volume:{Name:'supabase_db_'+project,CreatedAt:created,Labels:{'com.supabase.cli.project':project,'org.kinnso.na.run':plan.runId}},
    kongConfig:`services:\n  - name: auth\n    url: http://${names.auth}:9999\n    routes:\n      - name: auth\n        paths:\n          - /auth/v1/\n  - name: rest\n    url: http://${names.rest}:3000\n    routes:\n      - name: rest\n        paths:\n          - /rest/v1/\n`};
}
test('Docker inspect normalization preserves DB ancestry, volume, loopback ports and gateway routes',()=>{
  const raw=fixture(),normalized=normalizeTopology({plan,...raw});
  assert.doesNotThrow(()=>validateTopology(plan,normalized,{now:Date.parse(normalized.observedAt)}));
  assert.equal(normalized.containers.find(x=>x.role==='gateway').ports[0].hostIp,'127.0.0.1');
});
test('normalization rejects a foreign DB service or unexpected published port',()=>{
  const raw=fixture();raw.containers.find(x=>x.Name.endsWith('_auth_'+project)).Config.Env[0]='GOTRUE_DB_DATABASE_URL=postgresql://postgres@foreign:5432/postgres';
  assert.throws(()=>normalizeTopology({plan,...raw}),/DB_UPSTREAM|PROTOCOL|MISMATCH/);
  const other=fixture();other.containers.find(x=>x.Name.endsWith('_rest_'+project)).NetworkSettings.Ports={'3000/tcp':[{HostIp:'0.0.0.0',HostPort:'60023'}]};
  const normalized=normalizeTopology({plan,...other});
  assert.throws(()=>validateTopology(plan,normalized,{now:Date.parse(normalized.observedAt)}),/PORT_BINDING_MISMATCH/);
});
test('noninteractive runner actually forwards SQL through stdin and enforces exit failure',async()=>{
  const ok=await run(process.execPath,['-e','process.stdin.pipe(process.stdout)'],{input:'select 1;\n'});
  assert.equal(ok.stdout,'select 1;\n');
  await assert.rejects(run(process.execPath,['-e','process.stdout.write("private");process.exit(7)'],{input:'x'}),error=>error.code==='LOCAL_COMMAND_FAILED'&&error.exitCode===7);
  await assert.rejects(run(process.execPath,['-e','process.stderr.write("ERROR:  42P01: synthetic\\n");process.exit(1)']),error=>error.sqlState==='42P01');
});
