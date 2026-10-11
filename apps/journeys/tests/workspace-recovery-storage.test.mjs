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
test('workspace IDB recovery participates in the account transaction and remains invisible to another owner',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),value);assert.equal(await s.readLocalWorkspaceRecovery('B','mission:1'),null);await assert.rejects(s.saveLocalWorkspaceRecovery('B','mission:1',value),/CACHE_ACCOUNT_CHANGED/);});
test('unknown recovery cannot replace its UUID or payload, and only exact terminal receipt clearing releases it',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.saveLocalWorkspaceRecovery('A','mission:1',value);await assert.rejects(s.saveLocalWorkspaceRecovery('A','mission:1',{...value,pending:{...value.pending,command:{type:'submitEvidence',notes:'Changed'}}}),/PENDING_DRAFT/);await assert.rejects(s.saveLocalWorkspaceRecovery('A','mission:1',{...value,pending:null}),/PENDING_DRAFT/);await s.clearLocalWorkspaceRecovery('A','mission:1','wrong');assert.ok(await s.readLocalWorkspaceRecovery('A','mission:1'));await s.clearLocalWorkspaceRecovery('A','mission:1',uuid);assert.equal(await s.readLocalWorkspaceRecovery('A','mission:1'),null);});
test('account switch and explicit logout clear recovery with existing private snapshots and trip drafts',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.synchronizeAccountCache('B');await s.synchronizeAccountCache('A');assert.equal(await s.readLocalWorkspaceRecovery('A','mission:1'),null);await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.clearAccountCaches();await s.synchronizeAccountCache('A');assert.equal(await s.readLocalWorkspaceRecovery('A','mission:1'),null);});

test('definite request release atomically preserves the draft, rejects another owner, and cannot release a different pending UUID',async()=>{const s=await storage();await s.synchronizeAccountCache('A');await s.saveLocalWorkspaceRecovery('A','mission:1',value);await s.releaseLocalWorkspaceRecovery('A','mission:1','wrong');assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),value);await assert.rejects(s.releaseLocalWorkspaceRecovery('B','mission:1',uuid),/CACHE_ACCOUNT_CHANGED/);await s.releaseLocalWorkspaceRecovery('A','mission:1',uuid);assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),{...value,pending:null});const next={...value,pending:{requestId:'22222222-2222-4222-8222-222222222222',command:{type:'submitEvidence',notes:'Corrected explicit intent'}}};await s.saveLocalWorkspaceRecovery('A','mission:1',next);assert.deepEqual(JSON.parse(JSON.stringify(await s.readLocalWorkspaceRecovery('A','mission:1'))),next);});
