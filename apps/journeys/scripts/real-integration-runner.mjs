import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,lstatSync,accessSync,constants} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import path from 'node:path';
let SourceInputBlocked,TargetBlocked;

// Provisioning and migration are deliberately absent. An approved, attested,
// ready target and own production app process must already exist.
async function main(){
 const mode=process.argv[2]??'--preflight';
 const app=fileURLToPath(new URL('../',import.meta.url));
 // This guard also works when an extracted archive omitted the helper itself.
 let extracted=true;
 try{lstatSync(path.join(app,'SOURCE_METADATA.json'))}catch(error){if(error.code==='ENOENT')extracted=false}
 if(extracted){
  console.log(JSON.stringify({status:'BLOCKED',code:'FULL_REPOSITORY_REQUIRED',realTestsExecuted:false}));
  process.exitCode=78;return;
 }
 let helperAvailable=false;
 try{
  const helper=path.join(app,'scripts/real-suite-source.mjs');
  helperAvailable=lstatSync(helper).isFile();accessSync(helper,constants.R_OK);
 }catch{helperAvailable=false}
 if(!helperAvailable){
  console.log(JSON.stringify({status:'BLOCKED',code:'MISSING_SOURCE_INPUTS',
   missingInputs:['scripts/real-suite-source.mjs'],realTestsExecuted:false}));
  process.exitCode=78;return;
 }
 const source=await import('./real-suite-source.mjs');
 SourceInputBlocked=source.SourceInputBlocked;
 if(!['--preflight','--run'].includes(mode))throw new SourceInputBlocked('UNKNOWN_RUN_MODE');
 const approval=source.readRealSuiteApproval(process.env);
 source.assertRealSuiteSource({testSelection:approval?.testSelection});
 const {verifyTarget,Blocked,assertSafeLedger}=await import('../tests/real-integration/target.mjs');
 TargetBlocked=Blocked;
 const {summarizeRealRun}=await import('../tests/real-integration/result-summary.mjs');
 const target=await verifyTarget(process.env,{empty:process.env.KINNSO_REAL_IT_NONEMPTY_BASELINE!=='1'});
 if(mode==='--preflight'){
  console.log(JSON.stringify(assertSafeLedger({status:'READY_FOR_REAL_TESTS',productHead:target.head,project:target.identity.project,schemaFingerprint:target.schemaFingerprint})));
  return;
 }
 const output=process.env.KINNSO_REAL_IT_EVIDENCE;
 if(!output)throw new Blocked('EVIDENCE_DIRECTORY_REQUIRED');
 if(path.resolve(output)!==path.resolve(target.approval.evidenceRoot,target.approval.runId))throw new Blocked('EVIDENCE_SCOPE_MISMATCH');
 try{mkdirSync(output)}catch{throw new Blocked('FRESH_EVIDENCE_DIRECTORY_REQUIRED')}
 writeFileSync(path.join(output,'RUN.json'),JSON.stringify(assertSafeLedger({runId:target.approval.runId,productHead:target.head,project:target.identity.project}),null,2)+'\n',{flag:'wx'});
 const suite=source.realSuiteSourceInputs(target.approval.testSelection);
 const selection=suite.testSelection;
 const result=spawnSync(process.execPath,[
  path.join(app,'node_modules/@playwright/test/cli.js'),'test','--config',
  suite.config,
  ...(!['FULL_EXISTING_8','TRAVELLER_CORE_12','STALE_TAB_4','TODAY_SLICE_4'].includes(selection)?['--grep','real isolated target '+selection]:[]),
 ],{cwd:app,env:{...process.env,PLAYWRIGHT_NO_COPY_PROMPT:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:8*1024*1024});
 // Do not persist raw stdout/stderr: Auth/browser call logs may contain values.
 const report=assertSafeLedger(summarizeRealRun(result,{
  productHead:target.head,project:target.identity.project,testSelection:selection??'FULL_EXISTING_8',
 }));
 writeFileSync(path.join(output,'RESULT-'+target.approval.runId+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));process.exitCode=report.exitCode;
}
main().catch(error=>{
 const known=(SourceInputBlocked&&error instanceof SourceInputBlocked)||(TargetBlocked&&error instanceof TargetBlocked);
 const code=known?error.code:'PREFLIGHT_INTERNAL_FAILURE';
 console.log(JSON.stringify({status:'BLOCKED',code,realTestsExecuted:false,
  ...(known&&error.testSelection?{testSelection:error.testSelection,expectedCaseCount:error.expectedCaseCount}:{}),
  ...(known&&error.missingInputs?{missingInputs:error.missingInputs}:{}),
  ...(known&&error.resourceGate?{resourceGate:error.resourceGate}:{})}));
 process.exitCode=78;
});
