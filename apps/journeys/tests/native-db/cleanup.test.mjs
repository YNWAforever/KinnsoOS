import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCleanupIdentity} from './cleanup.mjs';
const target={runId:'run',networkId:'net-old',volumeId:'vol-old',containerIds:['db-old','auth-old','rest-old','gw-old'],imageDigests:{db:'1',auth:'2',rest:'3',gateway:'4'}};
const fresh=()=>({runId:'run',networkId:'net-old',volumeId:'vol-old',containerIds:[...target.containerIds],imageDigests:{...target.imageDigests}});
test('destructive cleanup accepts only the exact attested resource IDs and images',()=>{assert.doesNotThrow(()=>assertCleanupIdentity(target,fresh()));for(const delta of [{networkId:'net-new'},{volumeId:'vol-new'},{containerIds:['db-new','auth-old','rest-old','gw-old']},{imageDigests:{...target.imageDigests,db:'new'}}])assert.throws(()=>assertCleanupIdentity(target,{...fresh(),...delta}),{code:'CLEANUP_TARGET_CHANGED'});});
test('cleanup checks every destructive boundary through the same identity gate',async()=>{
  const calls=[],watcher={assert:target=>{calls.push(target.networkId+'/'+target.volumeId);if(target.networkId==='net-changed')throw Object.assign(Error('changed'),{code:'CLEANUP_TARGET_CHANGED'});}};
  assert.throws(()=>watcher.assert({...target,networkId:'net-changed'}),{code:'CLEANUP_TARGET_CHANGED'});assert.equal(calls.length,1);
});
