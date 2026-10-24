import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess,{spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const runner=fileURLToPath(new URL('../scripts/real-integration-runner.mjs',import.meta.url));
const realApp=fileURLToPath(new URL('../',import.meta.url));
const gate=()=>import('../scripts/real-suite-source.mjs');
const commonInputs=[
 'scripts/real-suite-source.mjs','scripts/real-integration-runner.mjs',
 'tests/real-integration/fixture.mjs','tests/real-integration/target.mjs',
 'tests/real-integration/result-summary.mjs','tests/real-integration/target-catalog.sql',
];
const today=['playwright.today-slice.config.ts','tests/real-integration/today-slice.spec.ts'];
const stale=['playwright.stale-tab.config.ts','tests/real-integration/stale-tab.spec.ts'];

function fixture(t){
 const repository=fs.mkdtempSync(path.join(tmpdir(),'kinnso-suite-source-'));
 // Only this freshly allocated, captured temporary directory is removed.
 t.after(()=>fs.rmSync(repository,{recursive:true,force:true}));
 const appRoot=path.join(repository,'apps/journeys');
 fs.mkdirSync(appRoot,{recursive:true});
 fs.mkdirSync(path.join(repository,'supabase/migrations'),{recursive:true});
 fs.writeFileSync(path.join(repository,'.git'),'synthetic repository marker; not target evidence\n');
 for(const name of [...commonInputs,...today,...stale]){
  const location=path.join(appRoot,name);
  fs.mkdirSync(path.dirname(location),{recursive:true});
  fs.writeFileSync(location,'// Synthetic availability fixture; never executed.\n');
 }
 return {repository,appRoot};
}

function repositoryCliFixture(t){
 const state=fixture(t);
 // Exercise the real public runner and helpers in a repository-shaped fixture,
 // even when this test itself is distributed in an extracted source archive.
 for(const name of commonInputs)
  fs.copyFileSync(path.join(realApp,name),path.join(state.appRoot,name));
 return {...state,runner:path.join(state.appRoot,'scripts/real-integration-runner.mjs')};
}

function runCli(location,mode='--preflight',env={}){
 const child=spawnSync(process.execPath,[location,mode],{env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(child.error,undefined);
 assert.equal(child.status,78);
 assert.equal(child.stderr,'');
 const report=JSON.parse(child.stdout);
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.realTestsExecuted,false);
 assert.doesNotMatch(child.stdout,/PRIVATE_CANARY|approval-private|Bearer|password|access_token|SOURCE_METADATA_CONTENT/);
 return report;
}

for(const mode of ['--preflight','--run']){
 test(`runner ${mode} blocks the missing original source before target verification`,t=>{
  const {runner:fixtureRunner}=repositoryCliFixture(t);
  const report=runCli(fixtureRunner,mode);
  assert.equal(report.code,'MISSING_SOURCE_INPUTS');
  assert.equal(report.realTestsExecuted,false);
  assert.equal(report.testSelection,'FULL_EXISTING_8');
  assert.equal(report.expectedCaseCount,8);
  assert.deepEqual(report.missingInputs,[
   'playwright.real-integration.config.ts',
   'tests/real-integration/journey.spec.ts',
  ]);
 });
}

for(const [testSelection,expectedCaseCount] of [
 ['FULL_EXISTING_8',8],['TRAVELLER_CORE_12',12],
 ['en/desktop',3],['en/mobile',3],['zh-HK/desktop',3],['zh-HK/mobile',3],
 ['en/',6],['zh-HK/',6],
]){
 test(`${testSelection} retains its exact count and cannot borrow the two four-case suites`,async t=>{
  const {assertRealSuiteSource}=await gate();
  const {appRoot}=fixture(t);
  assert.throws(()=>assertRealSuiteSource({appRoot,testSelection}),error=>{
   assert.equal(error.code,'MISSING_SOURCE_INPUTS');
   assert.equal(error.expectedCaseCount,expectedCaseCount);
   assert.equal(error.testSelection,testSelection);
   assert.deepEqual(error.missingInputs,['playwright.real-integration.config.ts','tests/real-integration/journey.spec.ts']);
   return true;
  });
 });
}

for(const [testSelection,selected,other] of [['TODAY_SLICE_4',today,stale],['STALE_TAB_4',stale,today]]){
 test(`${testSelection} checks only its own config and spec`,async t=>{
  const {assertRealSuiteSource}=await gate();
  const {appRoot}=fixture(t);
  for(const name of other)fs.unlinkSync(path.join(appRoot,name));
  const result=assertRealSuiteSource({appRoot,testSelection});
  assert.equal(result.expectedCaseCount,4);
  assert.equal(result.config,selected[0]);
  fs.unlinkSync(path.join(appRoot,selected[1]));
  assert.throws(()=>assertRealSuiteSource({appRoot,testSelection}),error=>{
   assert.equal(error.code,'MISSING_SOURCE_INPUTS');
   assert.deepEqual(error.missingInputs,[selected[1]]);return true;
  });
 });
}

for(const input of [...commonInputs,...today]){
 test(`a missing public dependency blocks before execution: ${input}`,async t=>{
  const {assertRealSuiteSource}=await gate();
  const {appRoot}=fixture(t);
  fs.unlinkSync(path.join(appRoot,input));
  assert.throws(()=>assertRealSuiteSource({appRoot,testSelection:'TODAY_SLICE_4'}),error=>{
   assert.equal(error.code,'MISSING_SOURCE_INPUTS');
   assert.deepEqual(error.missingInputs,[input]);return true;
  });
 });
}

test('a directory cannot satisfy a required source file',async t=>{
 const {assertRealSuiteSource}=await gate();
 const {appRoot}=fixture(t),name='tests/real-integration/target-catalog.sql';
 fs.unlinkSync(path.join(appRoot,name));fs.mkdirSync(path.join(appRoot,name));
 assert.throws(()=>assertRealSuiteSource({appRoot,testSelection:'TODAY_SLICE_4'}),error=>
  error.code==='MISSING_SOURCE_INPUTS'&&error.missingInputs[0]===name);
});

test('extracted metadata blocks even inside a repository with every selected public input',async t=>{
 const {assertRealSuiteSource}=await gate();
 const {appRoot}=fixture(t);
 fs.writeFileSync(path.join(appRoot,'SOURCE_METADATA.json'),'SOURCE_METADATA_CONTENT_PRIVATE_CANARY');
 assert.throws(()=>assertRealSuiteSource({appRoot,testSelection:'TODAY_SLICE_4'}),{code:'FULL_REPOSITORY_REQUIRED'});
});

for(const prerequisite of ['.git','supabase/migrations']){
 test(`repository source prerequisite is required: ${prerequisite}`,async t=>{
  const {assertRealSuiteSource}=await gate();
  const {appRoot,repository}=fixture(t);
  if(prerequisite==='.git')fs.unlinkSync(path.join(repository,prerequisite));
  else fs.rmdirSync(path.join(repository,prerequisite));
  assert.throws(()=>assertRealSuiteSource({appRoot,testSelection:'TODAY_SLICE_4'}),{code:'FULL_REPOSITORY_REQUIRED'});
 });
}

test('unknown selections never become filenames or appear in an error',async t=>{
 const {assertRealSuiteSource}=await gate();
 const {appRoot}=fixture(t);
 for(const testSelection of ['../../PRIVATE_CANARY','constructor','',null,{},4]){
  assert.throws(()=>assertRealSuiteSource({appRoot,testSelection}),error=>{
   assert.equal(error.code,'UNAPPROVED_TEST_SELECTION');
   assert.doesNotMatch(JSON.stringify(error),/PRIVATE_CANARY/);return true;
  });
 }
});

test('approval metadata is read only from the explicit pointer and capped at 128 KiB',async t=>{
 const {readRealSuiteApproval}=await gate();
 const {repository}=fixture(t),location=path.join(repository,'approval-private.json');
 assert.equal(readRealSuiteApproval({}),null);
 const record={approved:true,testSelection:'TODAY_SLICE_4',padding:''};
 const empty=JSON.stringify(record);
 record.padding='x'.repeat(128*1024-Buffer.byteLength(empty));
 fs.writeFileSync(location,JSON.stringify(record));
 assert.equal(readRealSuiteApproval({KINNSO_REAL_IT_APPROVAL_FILE:location}).testSelection,'TODAY_SLICE_4');
 fs.appendFileSync(location,' ');
 assert.throws(()=>readRealSuiteApproval({KINNSO_REAL_IT_APPROVAL_FILE:location}),{code:'APPROVAL_RECORD_UNREADABLE'});
 fs.unlinkSync(location);
 assert.throws(()=>readRealSuiteApproval({KINNSO_REAL_IT_APPROVAL_FILE:location}),{code:'APPROVAL_RECORD_UNREADABLE'});
});

test('malformed, unapproved and unknown-selection approval metadata fail closed',async t=>{
 const {readRealSuiteApproval}=await gate();
 const {repository}=fixture(t),location=path.join(repository,'approval-private.json');
 for(const [contents,code] of [
  ['PRIVATE_CANARY malformed JSON','APPROVAL_RECORD_UNREADABLE'],
  ['null','APPROVAL_REQUIRED'],['[]','APPROVAL_REQUIRED'],
  [JSON.stringify({approved:false,testSelection:'TODAY_SLICE_4'}),'APPROVAL_REQUIRED'],
  [JSON.stringify({approved:true,testSelection:'PRIVATE_CANARY'}),'UNAPPROVED_TEST_SELECTION'],
 ]){
  fs.writeFileSync(location,contents);
  assert.throws(()=>readRealSuiteApproval({KINNSO_REAL_IT_APPROVAL_FILE:location}),error=>{
   assert.equal(error.code,code);assert.doesNotMatch(String(error),/PRIVATE_CANARY|approval-private/);return true;
  });
 }
});

test('importing the public helper does not load target settings or read approval metadata',()=>{
 const helper=pathToFileURL(path.join(realApp,'scripts/real-suite-source.mjs')).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(helper)});console.log('PUBLIC_HELPER_IMPORTED')`],{
  env:{KINNSO_REAL_IT_APPROVAL_FILE:'PRIVATE_CANARY_UNREADABLE',KINNSO_REAL_IT_API_ORIGIN:'PRIVATE_CANARY_INVALID'},
  encoding:'utf8',windowsHide:true,timeout:10000,
 });
 assert.equal(child.status,0);assert.equal(child.stderr,'');assert.equal(child.stdout.trim(),'PUBLIC_HELPER_IMPORTED');
});

for(const mode of ['--preflight','--run']){
 test(`runner ${mode} reports the explicitly selected twelve-case source block without private output`,t=>{
  const {repository,runner:fixtureRunner}=repositoryCliFixture(t),location=path.join(repository,'approval-private.json');
  fs.writeFileSync(location,JSON.stringify({approved:true,testSelection:'TRAVELLER_CORE_12',privateNote:'PRIVATE_CANARY'}));
  const report=runCli(fixtureRunner,mode,{KINNSO_REAL_IT_APPROVAL_FILE:location,KINNSO_REAL_IT_API_ORIGIN:'PRIVATE_CANARY_INVALID'});
  assert.equal(report.code,'MISSING_SOURCE_INPUTS');assert.equal(report.expectedCaseCount,12);
  assert.equal(report.testSelection,'TRAVELLER_CORE_12');
  assert.deepEqual(report.missingInputs,['playwright.real-integration.config.ts','tests/real-integration/journey.spec.ts']);
  assert.ok(report.missingInputs.every(name=>!path.isAbsolute(name)&&!name.includes('..')));
 });
}

for(const testSelection of ['TODAY_SLICE_4','STALE_TAB_4']){
 test(`runner source eligibility for ${testSelection} retains the original approval gate`,t=>{
  const {repository,runner:fixtureRunner}=repositoryCliFixture(t),location=path.join(repository,'approval-private.json');
  fs.writeFileSync(location,JSON.stringify({approved:true,testSelection,privateNote:'PRIVATE_CANARY'}));
  const report=runCli(fixtureRunner,'--preflight',{KINNSO_REAL_IT_APPROVAL_FILE:location});
  assert.equal(report.code,'APPROVAL_REQUIRED');
 });
}

test('runner redacts malformed, oversized, absent and unknown-selection approval diagnostics',t=>{
 const {repository,runner:fixtureRunner}=repositoryCliFixture(t),location=path.join(repository,'approval-private.json');
 for(const [contents,code] of [
  ['PRIVATE_CANARY','APPROVAL_RECORD_UNREADABLE'],
  [' '.repeat(128*1024+1),'APPROVAL_RECORD_UNREADABLE'],
  [JSON.stringify({approved:true,testSelection:'PRIVATE_CANARY'}),'UNAPPROVED_TEST_SELECTION'],
 ]){
  fs.writeFileSync(location,contents);
  assert.equal(runCli(fixtureRunner,'--preflight',{KINNSO_REAL_IT_APPROVAL_FILE:location}).code,code);
 }
 fs.unlinkSync(location);
 assert.equal(runCli(fixtureRunner,'--preflight',{KINNSO_REAL_IT_APPROVAL_FILE:location}).code,'APPROVAL_RECORD_UNREADABLE');
});

test('runner blocks an extracted archive before importing its target or reading metadata contents',t=>{
 const {appRoot}=fixture(t);
 fs.copyFileSync(runner,path.join(appRoot,'scripts/real-integration-runner.mjs'));
 fs.copyFileSync(path.join(realApp,'scripts/real-suite-source.mjs'),path.join(appRoot,'scripts/real-suite-source.mjs'));
 fs.writeFileSync(path.join(appRoot,'SOURCE_METADATA.json'),'SOURCE_METADATA_CONTENT_PRIVATE_CANARY');
 const report=runCli(path.join(appRoot,'scripts/real-integration-runner.mjs'));
 assert.equal(report.code,'FULL_REPOSITORY_REQUIRED');
});

test('runner safely blocks an absent source helper before importing any target',t=>{
 const {appRoot}=fixture(t);
 fs.copyFileSync(runner,path.join(appRoot,'scripts/real-integration-runner.mjs'));
 fs.unlinkSync(path.join(appRoot,'scripts/real-suite-source.mjs'));
 const report=runCli(path.join(appRoot,'scripts/real-integration-runner.mjs'));
 assert.equal(report.code,'MISSING_SOURCE_INPUTS');assert.deepEqual(report.missingInputs,['scripts/real-suite-source.mjs']);
});

test('runner treats a directory in place of the source helper as a missing input',t=>{
 const {appRoot}=fixture(t);
 fs.copyFileSync(runner,path.join(appRoot,'scripts/real-integration-runner.mjs'));
 const helper=path.join(appRoot,'scripts/real-suite-source.mjs');
 fs.unlinkSync(helper);fs.mkdirSync(helper);
 const report=runCli(path.join(appRoot,'scripts/real-integration-runner.mjs'));
 assert.equal(report.code,'MISSING_SOURCE_INPUTS');assert.deepEqual(report.missingInputs,['scripts/real-suite-source.mjs']);
});

for(const mode of ['--preflight','--run']){
 test(`an extracted archive without the helper still requires the full repository (${mode})`,t=>{
  const {appRoot}=fixture(t);
  fs.copyFileSync(runner,path.join(appRoot,'scripts/real-integration-runner.mjs'));
  fs.unlinkSync(path.join(appRoot,'scripts/real-suite-source.mjs'));
  fs.writeFileSync(path.join(appRoot,'SOURCE_METADATA.json'),'SOURCE_METADATA_CONTENT_PRIVATE_CANARY');
  assert.equal(runCli(path.join(appRoot,'scripts/real-integration-runner.mjs'),mode).code,'FULL_REPOSITORY_REQUIRED');
 });
}

test('bounded approval reading rejects a file that outgrows its initial size metadata',async t=>{
 const {readRealSuiteApproval}=await gate();
 const {repository}=fixture(t),location=path.join(repository,'approval-private.json');
 fs.writeFileSync(location,JSON.stringify({approved:true,testSelection:'TODAY_SLICE_4',padding:'x'.repeat(128*1024)}));
 const stat=t.mock.method(fs,'fstatSync',()=>({isFile:()=>true,size:0}));
 syncBuiltinESMExports();
 t.after(()=>{stat.mock.restore();syncBuiltinESMExports()});
 assert.throws(()=>readRealSuiteApproval({KINNSO_REAL_IT_APPROVAL_FILE:location}),{code:'APPROVAL_RECORD_UNREADABLE'});
});

for(const extracted of [false,true]){
 test(`verifyTarget rechecks changed approval selection before commands or attestation reads (extracted=${extracted})`,async t=>{
  const {appRoot,repository}=fixture(t);
  const {assertRealSuiteSource}=await gate();
  assertRealSuiteSource({appRoot,testSelection:'TODAY_SLICE_4'});
  for(const name of ['scripts/real-suite-source.mjs','tests/real-integration/target.mjs'])
   fs.copyFileSync(path.join(realApp,name),path.join(appRoot,name));
  const location=path.join(repository,'approval-private.json'),attestation=path.join(repository,'PRIVATE_CANARY_ATTESTATION.json');
  fs.writeFileSync(location,JSON.stringify({approved:true,testSelection:'TRAVELLER_CORE_12'}));
  if(extracted)fs.writeFileSync(path.join(appRoot,'SOURCE_METADATA.json'),'SOURCE_METADATA_CONTENT_PRIVATE_CANARY');
  const command=t.mock.method(childProcess,'execFileSync',()=>{throw new Error('PRIVATE_CANARY_COMMAND_REFUSED')});
  const fetch=t.mock.method(globalThis,'fetch',()=>{throw new Error('PRIVATE_CANARY_NETWORK_REFUSED')});
  const read=fs.readFileSync;
  let attestationReads=0;
  const fileRead=t.mock.method(fs,'readFileSync',(name,...args)=>{
   if(name===attestation){attestationReads++;throw new Error('PRIVATE_CANARY_ATTESTATION_REFUSED')}
   return read(name,...args);
  });
  syncBuiltinESMExports();
  t.after(()=>{command.mock.restore();fetch.mock.restore();fileRead.mock.restore();syncBuiltinESMExports()});
  const {verifyTarget,Blocked}=await import(pathToFileURL(path.join(appRoot,'tests/real-integration/target.mjs')).href);
  await assert.rejects(verifyTarget({KINNSO_REAL_IT_APPROVAL_FILE:location,KINNSO_REAL_IT_ATTESTATION_FILE:attestation}),error=>{
   assert.ok(error instanceof Blocked);
   assert.equal(error.code,extracted?'FULL_REPOSITORY_REQUIRED':'MISSING_SOURCE_INPUTS');
   assert.equal(error.testSelection,'TRAVELLER_CORE_12');assert.equal(error.expectedCaseCount,12);return true;
  });
  assert.equal(command.mock.callCount(),0);assert.equal(fetch.mock.callCount(),0);assert.equal(attestationReads,0);
  await assert.rejects(verifyTarget({}),error=>error instanceof Blocked&&error.code==='APPROVAL_REQUIRED');
 });
}
