import {test} from 'node:test';
import assert from 'node:assert/strict';
const evidence=await import('../scripts/ci-evidence.mjs').catch(()=>({}));

test('CI summary records actual Node counts, never raw output or secrets',()=>{
 assert.equal(typeof evidence.summarizeCheck,'function');
 const report=evidence.summarizeCheck('unit',0,'secret=DO_NOT_PUBLISH\n# tests 3\n# pass 2\n# fail 0\n# skipped 1\n# cancelled 0\n# todo 0\n','a'.repeat(40));
 assert.deepEqual(report.counts,{passed:2,failed:0,skipped:1,cancelled:0,todo:0});
 assert.equal(report.result,'PASS');assert.equal(report.signedInProductionAcceptance,'NOT_RUN');
 assert.equal(JSON.stringify(report).includes('DO_NOT_PUBLISH'),false);
});

test('a zero exit without completed counts, interrupted tests or failing command cannot be a pass',()=>{
 assert.equal(typeof evidence.summarizeCheck,'function');
 for(const [code,text] of [[0,'running…'],[1,'# pass 2\n# fail 0\n# skipped 0\n# cancelled 0\n# todo 0'],[0,'# pass 2\n# fail 0\n# skipped 0\n# cancelled 1\n# todo 0']]){
  assert.notEqual(evidence.summarizeCheck('unit',code,text,'b'.repeat(40)).result,'PASS');
 }
});

test('browser counts are actual results, opposing capability skips stay separate',()=>{
 assert.equal(typeof evidence.summarizeCheck,'function');
 const report=evidence.summarizeCheck('browser',0,'\u001b[32m  1 skipped\n  43 passed (2.8m)\u001b[0m','c'.repeat(40));
 assert.deepEqual(report.counts,{passed:43,failed:0,skipped:1,cancelled:0,todo:0});
 assert.equal(report.result,'PASS');assert.throws(()=>evidence.summarizeCheck('browser',0,'43 passed (2.8m)','old-head'));
});
