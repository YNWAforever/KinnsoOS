import test from 'node:test';
import assert from 'node:assert/strict';
import {createActorSession,rpcSql,workerRoleSql} from './actor-sessions.mjs';

const actorId='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222';
const claims={sub:actorId,session_id:sessionId,role:'authenticated',is_anonymous:false,exp:2e10};
const identity={pid:41,sessionUser:'na_test_worker',currentUser:'authenticated',sessionSuper:false,sessionBypass:false,
  currentSuper:false,currentBypass:false,actorId,validSession:true,standardStrings:'on'};
function sqlClient(overrides={}){
  const calls=[];return {calls,closed:0,async query(sql){
    calls.push(sql);
    if(sql.includes('validSession'))return {rows:[JSON.stringify({...identity,...overrides})]};
    if(sql.includes('apply_kinnso_discovery_command'))return {rows:['{"ok":true,"receipt":{"revision":1}}']};
    return {rows:[]};
  },async close(){this.closed++;}};
}
test('actor transaction uses real session claims and verifies both login and effective role are nonprivileged',async()=>{
  const channel=sqlClient(),session=await createActorSession({channel,actor:{id:actorId,claims},loginRole:'na_test_worker'});
  await session.begin('READ COMMITTED');
  assert.equal(session.pid(),41);
  const r=await session.rpc('apply_kinnso_discovery_command',{p_target_id:actorId,p_expected_revision:0,p_request_id:sessionId,
    p_command:{kind:'clearPreferences',data:{}}});
  assert.equal(r.ok,true);
  assert(channel.calls.some(s=>s==='SET LOCAL ROLE authenticated;'));
  assert(channel.calls.some(s=>s.includes(sessionId)&&s.includes('request.jwt.claims')));
  await session.commit();await session.close();assert.equal(channel.closed,1);
});
test('superuser, BYPASSRLS, wrong actor, expired DB session and role mismatch cannot run a subject mutation',async()=>{
  for(const delta of [{sessionSuper:true},{currentSuper:true},{sessionBypass:true},{currentBypass:true},
    {actorId:sessionId},{validSession:false},{sessionUser:'postgres'},{currentUser:'service_role'}]){
    const channel=sqlClient(delta),session=await createActorSession({channel,actor:{id:actorId,claims},loginRole:'na_test_worker'});
    await assert.rejects(session.begin(),{code:'ACTOR_SQL_IDENTITY_INVALID'});
    await assert.rejects(session.rpc('apply_kinnso_discovery_command',{}),{code:'ACTOR_TRANSACTION_REQUIRED'});
    assert(!channel.calls.some(s=>s.includes('apply_kinnso_discovery_command')));
    assert(channel.calls.includes('ROLLBACK;'));await session.close();
  }
});
test('claims and RPC parser reject anonymous users, foreign session actors and arbitrary SQL functions',async()=>{
  for(const delta of [{is_anonymous:true},{sub:sessionId},{role:'service_role'},{exp:1},{session_id:null}]){
    await assert.rejects(createActorSession({channel:sqlClient(),actor:{id:actorId,claims:{...claims,...delta}},loginRole:'na_test_worker'}),{code:'ACTOR_SESSION_CLAIMS_INVALID'});
  }
  assert.throws(()=>rpcSql('pg_sleep',{p_request_id:actorId}),{code:'SUBJECT_RPC_NOT_ALLOWED'});
  assert.throws(()=>rpcSql('apply_kinnso_discovery_command',{'bad);drop':actorId}),{code:'SUBJECT_RPC_ARGUMENT_INVALID'});
  const sql=rpcSql('apply_kinnso_discovery_command',{p_target_id:actorId,p_expected_revision:0,p_request_id:sessionId,p_command:{kind:'saveIntent',data:{note:"O'Hare\\path"}}});
  assert(sql.includes("O''Hare"));assert(sql.includes('::jsonb'));
});
test('worker role is ephemeral, cannot create privileged objects and only switches to authenticated',()=>{
  const sql=workerRoleSql({name:'na_test_worker',password:'x'.repeat(48)});
  assert.match(sql,/NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION/);
  assert.match(sql,/GRANT authenticated TO "na_test_worker"/);
  assert.doesNotMatch(sql,/service_role|SUPERUSER true|BYPASSRLS true/i);
});
