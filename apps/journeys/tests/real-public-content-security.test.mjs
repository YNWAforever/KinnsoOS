import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
let subject={};
try{subject=await import('./real-public-content/target.mjs')}catch{}

const base={
 KINNSO_PUBLIC_IT_PROJECT:'kinnsoos-public-it-20261106',
 KINNSO_PUBLIC_IT_API_ORIGIN:'http://127.0.0.1:59721',
 KINNSO_PUBLIC_IT_APP_ORIGIN:'http://127.0.0.1:3498',
 KINNSO_PUBLIC_IT_DB_PORT:'59722',
};
const head='a'.repeat(40),archive='b'.repeat(64),manifest='c'.repeat(64),runId='11111111-1111-4111-8111-111111111111';
const approval={approved:true,approvalId:'local-public-content-plan-approval',project:base.KINNSO_PUBLIC_IT_PROJECT,apiOrigin:base.KINNSO_PUBLIC_IT_API_ORIGIN,appOrigin:base.KINNSO_PUBLIC_IT_APP_ORIGIN,productHead:head,sourceArchiveSha256:archive,migrationManifestSha256:manifest,runId,createdAt:'2026-11-06T00:00:00Z',expiresAt:'2026-11-06T12:00:00Z',minimumFreeMemoryBytes:3*1024**3,minimumFreeDiskBytes:6*1024**3,scopes:['create-owned-fixtures','delete-owned-fixtures','real-api-db-browser']};

test('public target requires a dedicated owned project and loopback endpoints',()=>{
 assert.equal(typeof subject.publicTargetConfiguration,'function');
 assert.deepEqual(subject.publicTargetConfiguration(base),{project:'kinnsoos-public-it-20261106',apiOrigin:'http://127.0.0.1:59721',appOrigin:'http://127.0.0.1:3498',dbPort:'59722',network:'supabase_network_kinnsoos-public-it-20261106',volume:'supabase_db_kinnsoos-public-it-20261106'});
 for(const patch of [
  {KINNSO_PUBLIC_IT_PROJECT:'kinnso-v3'},
  {KINNSO_PUBLIC_IT_PROJECT:'kinnsoos-pilot-20261013'},
  {KINNSO_PUBLIC_IT_PROJECT:'kinnsoos-trip-it-20261016'},
  {KINNSO_PUBLIC_IT_PROJECT:'random-project'},
  {KINNSO_PUBLIC_IT_API_ORIGIN:'http://localhost:59721'},
  {KINNSO_PUBLIC_IT_API_ORIGIN:'https://127.0.0.1:59721'},
  {KINNSO_PUBLIC_IT_APP_ORIGIN:'http://127.0.0.1:3498/private'},
  {KINNSO_PUBLIC_IT_DB_PORT:'0'},
 ])assert.throws(()=>subject.publicTargetConfiguration({...base,...patch}),error=>Boolean(error.code),'TARGET_INVALID',JSON.stringify(patch));
});

test('public approval binds source, archive, migration envelope, target, time and resource scope',()=>{
 assert.equal(typeof subject.validatePublicApproval,'function');
 const now=Date.parse('2026-11-06T01:00:00Z');
 assert.doesNotThrow(()=>subject.validatePublicApproval(approval,head,{now,memory:3*1024**3,disk:6*1024**3,env:base}));
 for(const patch of [
  {approved:false},{project:'kinnsoos-pilot-20261013'},{productHead:'d'.repeat(40)},
  {sourceArchiveSha256:'bad'},{migrationManifestSha256:'bad'},{runId:'bad'},
  {expiresAt:'2026-11-06T00:30:00Z'},{scopes:['create-owned-fixtures']},
  {minimumFreeMemoryBytes:2*1024**3},{minimumFreeDiskBytes:1},
 ])assert.throws(()=>subject.validatePublicApproval({...approval,...patch},head,{now,memory:3*1024**3,disk:6*1024**3,env:base}),error=>Boolean(error.code),JSON.stringify(patch));
 assert.throws(()=>subject.validatePublicApproval(approval,head,{now,memory:2*1024**3,disk:6*1024**3,env:base}),error=>error.code==='RESOURCE_GATE');
 assert.throws(()=>subject.validatePublicApproval(approval,head,{now,memory:3*1024**3,disk:5*1024**3,env:base}),error=>error.code==='RESOURCE_GATE');
});

test('public evidence rejects credentials and result classification never upgrades incomplete runs',()=>{
 assert.equal(typeof subject.assertSafePublicEvidence,'function');
 for(const value of [
  {password:'x'},{nested:{access_token:'x'}},{cookie:'x'},{connectionString:'x'},
  {SUPABASE_SERVICE_ROLE_KEY:'x'},{authorization:'Bearer x'},
 ])assert.throws(()=>subject.assertSafePublicEvidence(value),error=>error.code==='SENSITIVE_EVIDENCE');
 assert.doesNotThrow(()=>subject.assertSafePublicEvidence({project:'isolated',counts:[{kind:'passed',count:8}]}));
 assert.equal(subject.classifyPublicRun({status:0,stdout:'8 passed'}),'PASS_REAL_TARGET');
 for(const result of [
  {status:0,stdout:'7 passed 1 skipped'},
  {status:0,stdout:'8 passed 8 passed'},
  {status:1,stdout:'8 passed'},
  {status:null,error:{code:'ENOMEM'}},
 ])assert.notEqual(subject.classifyPublicRun(result),'PASS_REAL_TARGET');
});

test('runner source inputs include the public suite and preserve exactly eight cases',async()=>{
 const source=await import('../scripts/real-suite-source.mjs');
 assert.deepEqual(source.realSuiteSourceInputs('PUBLIC_CONTENT_8'),{
  testSelection:'PUBLIC_CONTENT_8',
  expectedCaseCount:8,
  config:'playwright.public-content.config.ts',
  requiredInputs:source.realSuiteSourceInputs('PUBLIC_CONTENT_8').requiredInputs,
 });
 const inputs=source.realSuiteSourceInputs('PUBLIC_CONTENT_8').requiredInputs;
 for(const name of [
  'tests/real-public-content/fixture.mjs',
  'tests/real-public-content/target.mjs',
  'tests/real-public-content/result-summary.mjs',
  'tests/real-public-content/journey.spec.ts',
 ])assert.ok(inputs.includes(name),name);
});

test('public runner source parses as an executable module',()=>{
 const runner=fileURLToPath(new URL('../scripts/real-public-content-runner.mjs',import.meta.url));
 const checked=spawnSync(process.execPath,['--check',runner],{encoding:'utf8',windowsHide:true});
 assert.equal(checked.status,0,checked.stderr);
});
