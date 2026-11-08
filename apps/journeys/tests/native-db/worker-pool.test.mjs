import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createWorkerPool} from './worker-pool.mjs';

const plan={runId:'8bce2805-c3e8-44f5-831e-805be1727c96'};
const target={...plan,dbContainerId:'db1',networkId:'net1',volumeId:'vol1',sourceHash:'a'.repeat(64),migrationHash:'b'.repeat(64)};
function child(pid,identityClaims){
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.killed=0;
  c.kill=()=>{c.killed++;queueMicrotask(()=>c.emit('close',1));};
  c.stdin=new Writable({write(chunk,encoding,done){
    const sql=chunk.toString();if(!sql.includes('\\echo')){done();return;}
    const marker=sql.match(/\\echo ([A-Za-z0-9_]+):/)[1];
    const identity={pid,sessionUser:process.env.FAKE_ROLE??'na_worker',currentUser:'authenticated',sessionSuper:false,sessionBypass:false,
      currentSuper:false,currentBypass:false,actorId:identityClaims.sub,validSession:true,standardStrings:'on'};
    const body=sql.includes('jsonb_build_object')?JSON.stringify(identity)+'\n':'';
    c.stdout.write(body+marker+': 00000\n');done();
  },final(done){queueMicrotask(()=>c.emit('close',0));done();}});
  return c;
}
test('pool verifies target before role creation or process spawn, never inherits provider credentials',async()=>{
  let mutations=0,spawns=0;
  await assert.rejects(createWorkerPool({plan,target,admin:async()=>{mutations++;},spawnPort:()=>{spawns++;}}),{code:'UNATTESTED_TARGET'});
  assert.equal(mutations+spawns,0);
});
test('foreign fresh target cannot receive a worker connection',async()=>{
  let spawns=0;
  const pool=await createWorkerPool({plan,target,verify:()=>{},admin:async()=>'',refresh:async()=>({...target,dbContainerId:'foreign'}),
    spawnPort:()=>{spawns++;}});
  await assert.rejects(pool.open({id:'a',client:{}}),{code:'TARGET_CONTINUITY_MISMATCH'});
  assert.equal(spawns,0);await pool.cleanup();
});
test('observer addresses exact owned PIDs and compares actual literal request IDs, never PostgREST query guesses',async()=>{
  const calls=[],pool=await createWorkerPool({plan,target,verify:()=>{},refresh:async()=>target,
    admin:async sql=>{calls.push(sql);if(sql.includes('writerQueryMatches'))return JSON.stringify({pid:42,blockers:[41],waitEventType:'Lock',writerQueryMatches:true,waiterQueryMatches:true});return '';}});
  await assert.rejects(pool.observe({writerPid:41,waiterPid:42,requestId:'bad'}),{code:'WORKER_OBSERVER_INPUT_INVALID'});
  // No worker was created, so unknown PIDs are rejected even when an admin could see them.
  await assert.rejects(pool.observe({writerPid:41,waiterPid:42,requestId:'11111111-1111-4111-8111-111111111111'}),{code:'WORKER_OBSERVER_INPUT_INVALID'});
  assert(!calls.some(s=>s.includes('writerQueryMatches')));await pool.cleanup();
});
test('only open worker PIDs in the exact role can be observed with a matching blocked query',async()=>{
  const actorId='33333333-3333-4333-8333-333333333333',sessionId='44444444-4444-4444-8444-444444444444',requestId='55555555-5555-4555-8555-555555555555';
  const claims={sub:actorId,session_id:sessionId,role:'authenticated',is_anonymous:false,exp:2e10};
  const token='x.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.x';
  const actor={id:actorId,client:{auth:{getSession:async()=>({data:{session:{access_token:token,user:{id:actorId}}},error:null}),
    getUser:async()=>({data:{user:{id:actorId}},error:null})}}};
  let pid=41,spawns=0;const role='na_'+plan.runId.replaceAll('-','')+'_worker';process.env.FAKE_ROLE=role;
  const pool=await createWorkerPool({plan,target,verify:()=>{},refresh:async()=>target,admin:async sql=>{
    if(sql.includes('jsonb_build_object')&&sql.includes('pg_stat_activity'))return JSON.stringify({pid:42,blockers:[41],waitEventType:'Lock',writerQueryMatches:true,waiterQueryMatches:true});
    return '';
  },spawnPort:()=>{spawns++;return child(pid++,claims);}});
  const a=await pool.open(actor),b=await pool.open(actor);await a.begin();await b.begin();
  const row=await pool.observe({writerPid:a.pid(),waiterPid:b.pid(),requestId});
  assert.deepEqual(row.blockers,[41]);assert.equal(row.writerQueryMatches,true);
  await pool.cleanup();assert.equal(spawns,2);
});
test('partial role setup is revoked and dropped before the pool creation fails',async()=>{
  const calls=[];let count=0;
  await assert.rejects(createWorkerPool({plan,target,verify:()=>{},refresh:async()=>target,
    admin:async sql=>{calls.push(sql);if(count++===0)throw Error('grant failed');return '';}}),{code:'WORKER_ROLE_SETUP_FAILED'});
  assert.equal(calls.length,2);assert.match(calls[1],/DROP ROLE IF EXISTS/);
});
test('worker cleanup attempts role drop even when backend termination fails',async()=>{
  const actorId='33333333-3333-4333-8333-333333333333',sessionId='44444444-4444-4444-8444-444444444444';
  const claims={sub:actorId,session_id:sessionId,role:'authenticated',is_anonymous:false,exp:2e10};
  const token='x.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.x';
  const actor={id:actorId,client:{auth:{getSession:async()=>({data:{session:{access_token:token,user:{id:actorId}}},error:null}),getUser:async()=>({data:{user:{id:actorId}},error:null})}}};
  const calls=[];let adminN=0;
  const pool=await createWorkerPool({plan,target,verify:()=>{},refresh:async()=>target,admin:async sql=>{
    calls.push(sql);adminN++;if(adminN===2)throw Error('terminate failed');return '';
  },spawnPort:()=>child(41,claims)});
  const a=await pool.open(actor);await a.begin();
  await assert.rejects(pool.cleanup(),{code:'WORKER_POOL_CLEANUP_FAILED'});
  assert(calls.at(-1).includes('DROP ROLE IF EXISTS'));
});
