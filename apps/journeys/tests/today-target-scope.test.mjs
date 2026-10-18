import test from 'node:test';
import assert from 'node:assert/strict';
import {validateApproval,expected} from './real-integration/target.mjs';
import {summarizeRealRun} from './real-integration/result-summary.mjs';
const head='a'.repeat(40),now=Date.parse('2026-10-19T00:00:00Z');
const approval=()=>({
 approved:true,approvalId:'synthetic today-slice approval',project:expected.project,
 apiOrigin:expected.apiOrigin,appOrigin:expected.appOrigin,productHead:head,
 sourceArchiveSha256:'b'.repeat(64),runId:'c731fc3e-38be-4f79-b333-5757b2a72497',
 expiresAt:'2026-10-19T01:00:00Z',scopes:['create-owned-fixtures','delete-owned-fixtures','real-api-db-browser'],
 minimumFreeMemoryBytes:2*1024**3,minimumFreeDiskBytes:6*1024**3,testSelection:'TODAY_SLICE_4',
 resourceAuthorization:{approved:true,kind:'human-approved-today-slice-2-6-gib-20261019',
  minimumFreeMemoryBytes:2*1024**3,minimumFreeDiskBytes:6*1024**3,
  renewalReceiptSha256:'c'.repeat(64),gatewayConfigSha256:'d'.repeat(64)},
});
test('today-slice gate accepts the exact approved original target at 2 GiB, without inheriting an old test selection',()=>{
 assert.equal(validateApproval(approval(),head,{now,memory:2*1024**3}).testSelection,'TODAY_SLICE_4');
});
test('today-slice gate rejects missing receipt identity, a lower floor and a foreign physical run',()=>{
 for(const change of [
  value=>{value.resourceAuthorization.renewalReceiptSha256=''},
  value=>{value.minimumFreeMemoryBytes=1024**3},
  value=>{value.runId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},
 ]) {
  const value=approval();change(value);
  assert.throws(()=>validateApproval(value,head,{now,memory:4*1024**3}),/APPROVED_RAM_THRESHOLD_MISMATCH/);
 }
 assert.throws(()=>validateApproval(approval(),head,{now,memory:2*1024**3-1}),/RESOURCE_GATE_FREE_RAM_BELOW_2_GIB/);
});
test('today-slice reporting requires all four new cells and never upgrades a partial or failed run',()=>{
 const context={productHead:head,project:expected.project,testSelection:'TODAY_SLICE_4'};
 assert.equal(summarizeRealRun({status:0,stdout:'4 passed',stderr:''},context).status,'PASS_REAL_TARGET');
 assert.equal(summarizeRealRun({status:0,stdout:'3 passed',stderr:''},context).status,'INCOMPLETE_REAL_TARGET');
 assert.equal(summarizeRealRun({status:1,stdout:'3 passed 1 failed',stderr:''},context).status,'FAIL_REAL_TARGET');
});
