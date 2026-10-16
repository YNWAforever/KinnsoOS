import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyTestTarget} from '../scripts/verify-test-target.mjs';
import {runtimeFixture,targetEnv,pilot} from './helpers/target-runtime.mjs';

test('actual local identity is attested without returning credentials',()=>{
 const f=runtimeFixture(),result=verifyTestTarget(targetEnv(),f.run);
 assert.equal(result.identity.dbId,f.containers[0].Id);
 assert.equal(result.identity.gatewayId,f.containers[1].Id);
 assert.equal(result.identity.networkId,'a'.repeat(64));
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.ok(f.calls.every(call=>['inspect','exec','ps'].includes(call[1])));
});
test('a forged b1 configuration cannot authorize the pilot serving the same port',()=>{
 const f=runtimeFixture();
 assert.throws(()=>verifyTestTarget(targetEnv('kinnsoos-b1-20261002'),f.run),/BLOCKED/);
});
for(const [name,mutate] of [
 ['stopped database',f=>{f.containers[0].State.Running=false}],
 ['wrong compose owner',f=>{f.containers[2].Config.Labels['com.docker.compose.project']='other'}],
 ['wrong volume',f=>{f.containers[0].Mounts[0].Name='shared'}],
 ['split network',f=>{f.containers[3].NetworkSettings.Networks['supabase_network_'+pilot].NetworkID='other'}],
 ['wrong published port',f=>{f.containers[1].NetworkSettings.Ports['8000/tcp'][0].HostPort='54421'}],
 ['different actual port owner',f=>f.setOwners('f'.repeat(64)+' tunnel\n')],
 ['remote REST database',f=>{f.containers[2].Config.Env=['PGRST_DB_URI=postgresql://role:secret@production.example:5432/postgres']}],
 ['remote Auth database',f=>{f.containers[3].Config.Env=['GOTRUE_DB_DATABASE_URL=postgresql://role:secret@production.example:5432/postgres']}],
 ['gateway upstream drift',f=>f.setConfig(f.config().replace('http://supabase_rest_'+pilot+':3000/','https://production.example/'))],
 ['gateway route drift',f=>f.setConfig(f.config().replace('/rest/v1/','/other/'))],
])test('runtime gate refuses '+name,()=>{
 const f=runtimeFixture();mutate(f);
 assert.throws(()=>verifyTestTarget(targetEnv(),f.run),/BLOCKED/);
});
test('missing Docker evidence fails closed and never leaks stderr or credentials',()=>{
 assert.throws(()=>verifyTestTarget(targetEnv(),()=>{throw Error('secret connection failed')}),error=>/BLOCKED/.test(error.message)&&!error.message.includes('secret'));
});
test('contradictory resolved URLs fail before inspecting or constructing anything',()=>{
 const f=runtimeFixture();
 assert.throws(()=>verifyTestTarget({...targetEnv(),NEXT_PUBLIC_SUPABASE_URL:'https://production.example'},f.run),/BLOCKED/);
 assert.equal(f.calls.length,0);
});
test('an additional more-specific RPC route cannot override the approved gateway namespace',()=>{
 const f=runtimeFixture();
 f.setConfig(f.config()+`  - name: hidden-override
    url: https://production.example/
    routes:
      - name: override
        paths:
          - /rest/v1/rpc/
`);
 assert.throws(()=>verifyTestTarget(targetEnv(),f.run),/BLOCKED/);
});
test('inline and regex route overrides fail closed rather than escaping the narrow config parser',()=>{
 for(const paths of ['        paths: ["/rest/v1/rpc/"]','        paths:\n          - ~/rest/v1/rpc/']){
  const f=runtimeFixture();f.setConfig(f.config()+`  - name: hidden-override\n    url: https://production.example/\n    routes:\n      - name: override\n${paths}\n`);
  assert.throws(()=>verifyTestTarget(targetEnv(),f.run),/BLOCKED/);
 }
});
