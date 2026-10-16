import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {createContext,runInContext} from 'node:vm';

// A strict IDB boundary enforces transaction store membership and atomic aborts.
async function storage(){
 const stores=new Map();
 const db={objectStoreNames:{contains:n=>stores.has(n)},createObjectStore:n=>stores.set(n,new Map()),close(){},transaction(names){
  names=Array.isArray(names)?names:[names];const copies=new Map(names.map(n=>{assert.ok(stores.has(n));return[n,new Map(stores.get(n))]}));let pending=0,aborted=false,finished=false;
  const tx={abort(){aborted=true;queueMicrotask(()=>tx.onabort?.());},objectStore(n){if(!copies.has(n))throw Error('NotFoundError: store outside transaction');const copy=copies.get(n);return{get(key){pending++;const r={};queueMicrotask(()=>{r.result=structuredClone(copy.get(key));r.onsuccess?.();pending--;complete();});return r;},put(value){copy.set(value.key,structuredClone(value));},delete:key=>copy.delete(key),clear:()=>copy.clear()};}};
  function complete(){queueMicrotask(()=>{if(!pending&&!aborted&&!finished){finished=true;for(const[n,copy]of copies)stores.set(n,copy);tx.oncomplete?.();}});}complete();return tx;
 }};
 const indexedDB={open(){const r={result:db};queueMicrotask(()=>{r.onupgradeneeded?.();r.onsuccess?.();});return r;}};
 const source=await transform(await readFile(new URL('../lib/trips/local-drafts.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}),module={exports:{}};
 runInContext(source.code,createContext({module,exports:module.exports,indexedDB,TextEncoder,window:{dispatchEvent(){}},CustomEvent:class{},structuredClone}));return module.exports;
}
const uuid='11111111-1111-4111-8111-111111111111';
const value={version:1,draft:{notes:'Owned original'},pending:{requestId:uuid,command:{type:'submitEvidence',notes:'Exact original'}}};
test('creation recovery freezes its original payload; logout retains only the actor-bound opaque receipt',async()=>{
 const s=await storage(),guideId='22222222-2222-4222-8222-222222222222',tripId='33333333-3333-4333-8333-333333333333';
 const intent={requestId:uuid,guideId,version:1,flowId:tripId,tripId:null},input={title:'Private title',startDate:null,timezone:'UTC'};
 assert.equal(typeof s.savePendingCreation,'function');
 await s.synchronizeAccountCache('A');await s.savePendingCreation('A',intent,input);
 await assert.rejects(s.savePendingCreation('A',{...intent,requestId:tripId},input),/PENDING_DRAFT/);
 await assert.rejects(s.savePendingCreation('A',intent,{...input,title:'Changed'}),/PENDING_DRAFT/);
 assert.equal(await s.readPendingCreation('B',guideId),null);
 await s.clearAccountCaches();await s.synchronizeAccountCache('B');assert.equal(await s.readPendingCreation('B',guideId),null);
 await s.synchronizeAccountCache('A');const reopened=await s.readPendingCreation('A',guideId);assert.equal(reopened.input,null);assert.equal(reopened.intent.requestId,uuid);
 await assert.rejects(s.savePendingCreation('A',intent,{...input,title:'Replacement after logout'}),/PENDING_DRAFT/);
 await assert.rejects(s.recordCreatedTrip('B',guideId,uuid,tripId),/CACHE_ACCOUNT_CHANGED/);
 await s.recordCreatedTrip('A',guideId,uuid,tripId);assert.equal((await s.readPendingCreation('A',guideId)).intent.tripId,tripId);
 await s.clearPendingCreation('A',guideId,'wrong');assert.ok(await s.readPendingCreation('A',guideId));
 await s.clearPendingCreation('A',guideId,uuid);assert.equal(await s.readPendingCreation('A',guideId),null);
});
test('workspace IDB recovery participates in the account transaction and remains invisible to another owner',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),value);assert.equal(await s.readLocalWorkspaceRecovery('B','mission:1'),null);await assert.rejects(s.saveLocalWorkspaceRecovery('B','mission:1',value),/CACHE_ACCOUNT_CHANGED/);});
test('unknown recovery cannot replace its UUID or payload, and only exact terminal receipt clearing releases it',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.saveLocalWorkspaceRecovery('A','mission:1',value);await assert.rejects(s.saveLocalWorkspaceRecovery('A','mission:1',{...value,pending:{...value.pending,command:{type:'submitEvidence',notes:'Changed'}}}),/PENDING_DRAFT/);await assert.rejects(s.saveLocalWorkspaceRecovery('A','mission:1',{...value,pending:null}),/PENDING_DRAFT/);await s.clearLocalWorkspaceRecovery('A','mission:1','wrong');assert.ok(await s.readLocalWorkspaceRecovery('A','mission:1'));await s.clearLocalWorkspaceRecovery('A','mission:1',uuid);assert.equal(await s.readLocalWorkspaceRecovery('A','mission:1'),null);});
test('account switch and explicit logout clear recovery with existing private snapshots and trip drafts',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.synchronizeAccountCache('B');await s.synchronizeAccountCache('A');assert.equal(await s.readLocalWorkspaceRecovery('A','mission:1'),null);await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.clearAccountCaches();await s.synchronizeAccountCache('A');assert.equal(await s.readLocalWorkspaceRecovery('A','mission:1'),null);});

test('definite request release atomically preserves the draft, rejects another owner, and cannot release a different pending UUID',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.releaseLocalWorkspaceRecovery('A','mission:1','wrong');assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),value);await assert.rejects(s.releaseLocalWorkspaceRecovery('B','mission:1',uuid),/CACHE_ACCOUNT_CHANGED/);await s.releaseLocalWorkspaceRecovery('A','mission:1',uuid);assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),{...value,pending:null});const next={...value,pending:{requestId:'22222222-2222-4222-8222-222222222222',command:{type:'submitEvidence',notes:'Corrected explicit intent'}}};await s.saveLocalWorkspaceRecovery('A','mission:1',next);assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),next);});

test('acknowledgement atomically persists the remaining draft and releases only its exact receipt',async()=>{
 const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','support',value);
 const remaining={notes:'Another unsent draft'};
 await assert.rejects(s.completeLocalWorkspaceRecovery('A','support','wrong',remaining),/PENDING_DRAFT/);
 assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','support'))),value);
 await s.completeLocalWorkspaceRecovery('A','support',uuid,remaining);
 assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','support'))),{version:1,draft:remaining,pending:null});
});

test('acknowledgement cannot cross accounts or replace a journal with an oversized draft',async()=>{
 const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','support',value);
 await assert.rejects(s.completeLocalWorkspaceRecovery('B','support',uuid,{}),/CACHE_ACCOUNT_CHANGED/);
 await assert.rejects(s.completeLocalWorkspaceRecovery('A','support',uuid,{text:'x'.repeat(80000)}),/INVALID_RECOVERY/);
 assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','support'))),value);
 await s.synchronizeAccountCache('B');
 await assert.rejects(s.completeLocalWorkspaceRecovery('A','support',uuid,{}),/CACHE_ACCOUNT_CHANGED/);
});

const adoption={guideId:uuid,tripId:'22222222-2222-4222-8222-222222222222',version:1,revision:3,requestId:uuid,flowId:'33333333-3333-4333-8333-333333333333'};
test('opaque adoption intent survives reopen and logout but remains hidden from a different current owner',async()=>{
 const s=await storage();assert.equal(typeof s.savePendingAdoption,'function');
 await s.synchronizeAccountCache('A');await s.savePendingAdoption('A',adoption);
 assert.deepEqual(JSON.parse(JSON.stringify(await s.readPendingAdoption('A',uuid))),adoption);
 await s.clearAccountCaches();await s.synchronizeAccountCache('B');
 assert.equal(await s.readPendingAdoption('A',uuid),null);
 assert.equal(await s.readPendingAdoption('B',uuid),null);
 await s.synchronizeAccountCache('A');
 assert.deepEqual(JSON.parse(JSON.stringify(await s.readPendingAdoption('A',uuid))),adoption);
});
test('an unresolved adoption cannot change payload or request identity, and only its owner can release it',async()=>{
 const s=await storage();assert.equal(typeof s.savePendingAdoption,'function');await s.synchronizeAccountCache('A');
 await s.savePendingAdoption('A',adoption);await s.savePendingAdoption('A',adoption);
 for(const patch of [{revision:4},{tripId:uuid},{requestId:adoption.tripId}])await assert.rejects(s.savePendingAdoption('A',{...adoption,...patch}),/PENDING_DRAFT/);
 await s.clearPendingAdoption('A',uuid,'wrong');assert.ok(await s.readPendingAdoption('A',uuid));
 await assert.rejects(s.clearPendingAdoption('B',uuid,uuid),/CACHE_ACCOUNT_CHANGED/);
 await s.clearPendingAdoption('A',uuid,uuid);assert.equal(await s.readPendingAdoption('A',uuid),null);
 await assert.rejects(s.savePendingAdoption('A',{...adoption,privateNote:'do not store this'}),/INVALID_ADOPTION/);
});
