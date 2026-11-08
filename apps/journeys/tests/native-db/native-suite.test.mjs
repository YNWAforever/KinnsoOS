import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeCases} from './native-suite.mjs';
const runId='8bce2805-c3e8-44f5-831e-805be1727c96';
const context={runId,sourceHash:'a'.repeat(64),targetReceiptHash:'b'.repeat(64),schemaReceiptHash:'c'.repeat(64),cleanupStatus:'PASS'};
const manifest={expanded:true,cases:[
  {id:'NA03.realAuth',task:'NA03',required:true,evidenceLevel:'L2',implemented:true,expected:'auth'},
  {id:'NA04.privateIntentRpc',task:'NA04',required:true,evidenceLevel:'L2',implemented:true,expected:'private'}
]};

test('native suite refuses to pass incomplete handlers and retains one result per case',async()=>{
  let cleaned=0;
  const result=await runNativeCases({manifest,context,cleanup:async()=>{cleaned++;},handlers:new Map([
    ['NA03.realAuth',async()=>({actual:'real'})]
  ]),evidenceWriter:async({id})=>`cases/${id}.json`});
  assert.equal(result.summary.status,'BLOCKED');
  assert.deepEqual(result.cases.map(x=>x.status),['PASS','BLOCKED']);
  assert.equal(cleaned,1);
});

test('handler errors are sanitized, cleanup failure blocks and no unexpected case is accepted',async()=>{
  const handlers=new Map([
    ['NA03.realAuth',async()=>{throw Object.assign(Error('password=secret'),{code:'AUTH_FAILED'});}],
    ['NA04.privateIntentRpc',async()=>({actual:'private'})]
  ]);
  const result=await runNativeCases({manifest,context,cleanup:async()=>{throw Error('cleanup secret');},handlers,additional:[{id:'foreign',status:'PASS'}],
    evidenceWriter:async({id})=>`cases/${id}.json`});
  assert.equal(result.summary.status,'INVALID_EVIDENCE');
  assert.equal(result.cases[0].status,'FAIL');
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(result.cleanupStatus,'FAIL');
});
