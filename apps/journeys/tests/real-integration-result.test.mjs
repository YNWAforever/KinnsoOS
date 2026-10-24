import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSafeLedger} from './real-integration/target.mjs';
import {summarizeRealRun} from './real-integration/result-summary.mjs';

const context={productHead:'d'.repeat(40),project:'kinnsoos-trip-it-20261016',testSelection:'FULL_EXISTING_8'};
const summarize=(result)=>summarizeRealRun(result,context);
const child=(status,stdout='',stderr='')=>({status,stdout,stderr});

test('successful original cases retain source, scope and exact counts',()=>{
 const r=summarize(child(0,'8 passed (1m)'));
 assert.equal(r.status,'PASS_REAL_TARGET');
 assert.equal(r.exitCode,0);
 assert.deepEqual(r.counters,[{kind:'passed',count:8}]);
 assert.equal(r.productHead,context.productHead);
 assert.equal(r.testSelection,'FULL_EXISTING_8');
});
test('pre-case RAM failure has an explicit code and never becomes eight test failures',()=>{
 const r=summarize(child(1,'','IntegrationBlocked: RESOURCE_GATE_FREE_RAM_BELOW_3_GIB\n at validateApproval'));
 assert.equal(r.status,'BLOCKED_BEFORE_CASE_RESULTS');
 assert.equal(r.preCaseCode,'RESOURCE_GATE_FREE_RAM_BELOW_3_GIB');
 assert.deepEqual(r.counters,[]);
 assert.match(r.transcriptSha256,/^[a-f0-9]{64}$/);
});
test('unknown empty failure stays unclassified rather than being blamed on RAM',()=>{
 const r=summarize(child(1));
 assert.equal(r.status,'INCONCLUSIVE_NO_CASE_RESULTS');
 assert.equal(r.preCaseCode,'UNCLASSIFIED');
 assert.equal(r.exitCode,1);
});
test('native case failures and SQLSTATE are preserved',()=>{
 const r=summarize(child(1,'1 passed 1 failed\nREAL_IT_FAILURE WITHDRAWAL_AND_PRIVATE_COPY 40P01'));
 assert.equal(r.status,'FAIL_REAL_TARGET');
 assert.deepEqual(r.failures,[{stage:'WITHDRAWAL_AND_PRIVATE_COPY',code:'40P01'}]);
 assert.deepEqual(r.counters,[{kind:'passed',count:1},{kind:'failed',count:1}]);
});
test('a later RAM error cannot reclassify already reported case failures',()=>{
 const r=summarize(child(1,'1 passed 1 failed','RESOURCE_GATE_FREE_RAM_BELOW_3_GIB'));
 assert.equal(r.status,'FAIL_REAL_TARGET');
});
test('spawn refusal reports only its safe platform code',()=>{
 const r=summarize({...child(null),error:{code:'ENOMEM',message:'DO_NOT_PERSIST_PRIVATE_MESSAGE'}});
 assert.equal(r.status,'BLOCKED_BEFORE_CASE_RESULTS');
 assert.equal(r.preCaseCode,'ENOMEM');
 assert.notEqual(r.exitCode,0);
 assert.ok(!JSON.stringify(r).includes('DO_NOT_PERSIST_PRIVATE_MESSAGE'));
});
test('raw diagnostics and credential-shaped text never enter evidence',()=>{
 const r=summarize(child(1,'DO_NOT_PERSIST_PRIVATE_VALUE','RESOURCE_GATE_FREE_RAM_BELOW_3_GIB'));
 assert.ok(!JSON.stringify(r).includes('DO_NOT_PERSIST_PRIVATE_VALUE'));
 assert.doesNotThrow(()=>assertSafeLedger(r));
 assert.match(r.transcriptSha256,/^[a-f0-9]{64}$/);
});
test('zero exit without executed-case counts and skipped-only output cannot pass',()=>{
 for(const output of ['','8 skipped']){
  const r=summarize(child(0,output));
  assert.notEqual(r.status,'PASS_REAL_TARGET');
  assert.notEqual(r.exitCode,0);
 }
});
test('missing module is distinguished without persisting stack contents',()=>{
 const r=summarize(child(1,'','Error [ERR_MODULE_NOT_FOUND]: DO_NOT_PERSIST_PRIVATE_PATH'));
 assert.equal(r.status,'BLOCKED_BEFORE_CASE_RESULTS');
 assert.equal(r.preCaseCode,'ERR_MODULE_NOT_FOUND');
 assert.ok(!JSON.stringify(r).includes('DO_NOT_PERSIST_PRIVATE_PATH'));
});
test('annotated RAM diagnostics retain only valid byte samples and explicitly mark invalid readings',()=>{
 const low=summarize(child(1,'','RESOURCE_GATE_FREE_RAM_BELOW_3_GIB freeBytes=1024 minimumBytes=3221225472 readingValid=true'));
 assert.deepEqual(low.resourceGate,{readingValid:true,freeBytes:1024,minimumBytes:3221225472});
 const invalid=summarize(child(1,'','RESOURCE_GATE_READING_INVALID freeBytes=null minimumBytes=3221225472 readingValid=false'));
 assert.equal(invalid.preCaseCode,'RESOURCE_GATE_READING_INVALID');
 assert.deepEqual(invalid.resourceGate,{readingValid:false,freeBytes:null,minimumBytes:3221225472});
});

test('a full real run cannot pass with skipped or missing cases',()=>{
 for(const output of ['2 passed 6 skipped','7 passed 1 skipped','7 passed','8 passed 1 did not run']){
  const r=summarize(child(0,output));
  assert.equal(r.status,'INCOMPLETE_REAL_TARGET',output);
  assert.notEqual(r.exitCode,0,output);
 }
});
test('a focused real run can pass only its explicitly selected case count',()=>{
 for(const [testSelection,count] of [
  ['en/desktop',3],['en/mobile',3],['zh-HK/desktop',3],['zh-HK/mobile',3],
  ['en/',6],['zh-HK/',6],['STALE_TAB_4',4],
 ]){
  const r=summarizeRealRun(child(0,`${count} passed`),{...context,testSelection});
  assert.equal(r.status,'PASS_REAL_TARGET');
  assert.equal(r.testSelection,testSelection);
  const missing=summarizeRealRun(child(0,`${count-1} passed 1 skipped`),{...context,testSelection});
  assert.equal(missing.status,'INCOMPLETE_REAL_TARGET');
  assert.notEqual(missing.exitCode,0);
 }
});
test('unexpected or repeated result totals cannot certify a complete real run',()=>{
 for(const output of ['9 passed','8 passed\n8 passed']){
  const r=summarize(child(0,output));
  assert.equal(r.status,'INCOMPLETE_REAL_TARGET');
  assert.notEqual(r.exitCode,0);
 }
 const unknown=summarizeRealRun(child(0,'8 passed'),{...context,testSelection:'unreviewed selection'});
 assert.equal(unknown.status,'INCOMPLETE_REAL_TARGET');
 assert.notEqual(unknown.exitCode,0);
});
test('the explicitly extended traveller core suite requires all twelve cases',()=>{
 const scope={...context,testSelection:'TRAVELLER_CORE_12'};
 const complete=summarizeRealRun(child(0,'12 passed'),scope);
 assert.equal(complete.status,'PASS_REAL_TARGET');
 assert.equal(complete.expectedCaseCount,12);
 for(const output of ['8 passed','11 passed 1 skipped','8 passed 4 did not run']){
  const partial=summarizeRealRun(child(0,output),scope);
  assert.equal(partial.status,'INCOMPLETE_REAL_TARGET');assert.notEqual(partial.exitCode,0);
 }
});
