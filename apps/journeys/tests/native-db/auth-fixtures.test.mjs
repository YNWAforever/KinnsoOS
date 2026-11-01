import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthFixtures,actorPlan} from './auth-fixtures.mjs';
import {retryFixtureCleanup} from './live-runtime.mjs';

const runId='8bce2805-c3e8-44f5-831e-805be1727c96';
function fakeAdmin(){
  const state={users:[],creators:[],merchants:[],branches:[],members:[],ops:[],deleted:[],revoked:[]};
  let serial=0;
  return {state,async createUser({email}){const id=`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;state.users.push({id,email});return {id};},
    async signIn({email}){const user=state.users.find(u=>u.email===email);if(!user)throw Error('unknown');return {id:user.id,client:{actor:user.id}};},
    async updateCreator({id,status,displayName}){state.creators.push({id,status,displayName});},
    async insertMerchant(row){state.merchants.push(structuredClone(row));},
    async insertBranch(row){state.branches.push(structuredClone(row));},
    async insertMember(row){state.members.push(structuredClone(row));},
    async insertOps(row){state.ops.push(structuredClone(row));},
    async revokeSessions(userId){state.revoked.push(userId);},
    async deleteUser(id){state.deleted.push(id);state.users=state.users.filter(u=>u.id!==id);}};
}

test('actor plan is run-scoped, covers all required roles and keeps unknown identities separate',()=>{
  const plan=actorPlan(runId);
  assert.deepEqual(plan.map(x=>x.name),['travellerA','travellerB','creatorA','creatorB','merchantA','merchantB','memberA','ops','invalidCreator']);
  assert(plan.every(x=>x.email.startsWith(`na-${runId}-`)&&x.email.endsWith('@example.test')));
  assert.equal(new Set(plan.map(x=>x.email)).size,plan.length);
  assert.equal(plan.find(x=>x.name==='merchantA').companyKey,'A');
  assert.equal(plan.find(x=>x.name==='merchantB').companyKey,'B');
});

test('fixtures create real-session handles, two creators, scoped merchants and ops without exposing passwords',async()=>{
  const admin=fakeAdmin(),fixture=await createAuthFixtures({admin,runId});
  assert.equal(Object.keys(fixture.actors).length,9);
  assert.equal(admin.state.users.length,9);
  assert.deepEqual(admin.state.creators.map(x=>x.status),['active','active','suspended']);
  assert.equal(admin.state.merchants.length,2);
  assert.deepEqual(admin.state.merchants.map(x=>x.companyKey),['A','B']);
  assert.equal(admin.state.branches.filter(x=>x.merchantKey==='A').length,2);
  assert.equal(admin.state.branches.filter(x=>x.merchantKey==='B').length,1);
  assert.equal(admin.state.members.length,1);
  assert.equal(admin.state.members[0].merchantKey,'A');
  assert.equal(admin.state.members[0].role,'marketing');
  assert.equal(admin.state.ops.length,1);
  assert.equal(JSON.stringify(fixture.publicView()).includes('password'),false);
  assert.equal(JSON.stringify(fixture.publicView()).includes('@example.test'),true);
  const ownedIds=new Set(admin.state.users.map(x=>x.id));
  await fixture.cleanup();
  assert.deepEqual(new Set(admin.state.deleted),ownedIds);
});

test('fixture cleanup is idempotent and only deletes its own users',async()=>{
  const admin=fakeAdmin();admin.state.users.push({id:'ffffffff-ffff-4fff-8fff-ffffffffffff',email:'foreign@example.test'});
  const fixture=await createAuthFixtures({admin,runId});
  await fixture.cleanup();await fixture.cleanup();
  assert(admin.state.users.some(x=>x.email==='foreign@example.test'));
});

test('a partial creation failure revokes sessions and cleans every owned user',async()=>{
  const admin=fakeAdmin(),original=admin.insertOps;
  admin.insertOps=async()=>{throw Error('synthetic failure');};
  await assert.rejects(createAuthFixtures({admin,runId}),/FIXTURE_SETUP_FAILED/);
  assert.equal(admin.state.users.length,0);
  assert(admin.state.revoked.length>=1);
  assert.equal(admin.insertOps,admin.insertOps);
  admin.insertOps=original;
});

test('invalid adapters and malformed run identity cannot create a client',async()=>{
  let calls=0;
  await assert.rejects(createAuthFixtures({admin:{createUser:async()=>{calls++;}},runId}),{code:'FIXTURE_ADAPTER_INVALID'});
  await assert.rejects(createAuthFixtures({admin:fakeAdmin(),runId:'foreign'}),{code:'RUN_ID_INVALID'});
  assert.equal(calls,0);
});

test('partial cleanup can be retried and is only marked complete after every owned user is deleted',async()=>{
  const admin=fakeAdmin(),fixture=await createAuthFixtures({admin,runId}),original=admin.deleteUser;let failed=false;
  admin.deleteUser=async id=>{if(!failed){failed=true;throw Error('temporary');}return original(id);};
  await assert.rejects(fixture.cleanup(),{code:'FIXTURE_CLEANUP_FAILED'});
  await fixture.cleanup();
  assert.equal(admin.state.users.length,0);
});
test('setup failure exposes a retryable cleanup handle when the immediate cleanup fails',async()=>{
  const admin=fakeAdmin(),originalDelete=admin.deleteUser;let deleteAttempts=0;
  admin.signIn=async()=>{throw Error('signin failed');};
  admin.deleteUser=async id=>{deleteAttempts++;if(deleteAttempts===1)throw Error('temporary delete failure');return originalDelete(id);};
  let error;try{await createAuthFixtures({admin,runId});}catch(e){error=e;}
  assert.equal(error.code,'FIXTURE_SETUP_AND_CLEANUP_FAILED');
  assert.equal(typeof error.fixtureCleanup,'function');
  await error.fixtureCleanup();
  assert.equal(admin.state.users.length,0);
});
test('live setup retries a partial fixture cleanup before surfacing the setup failure',async()=>{
  let attempts=0;
  assert.equal(await retryFixtureCleanup(async()=>{if(++attempts<2)throw Error('temporary');}),true);
  assert.equal(attempts,2);
  await assert.rejects(retryFixtureCleanup(async()=>{throw Error('still failing');},{attempts:2}),{code:'NATIVE_FIXTURE_CLEANUP_FAILED'});
});
