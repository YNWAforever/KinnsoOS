import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import path from 'node:path';
import {verifyTarget,Blocked,assertSafeLedger} from '../tests/real-integration/target.mjs';
import {summarizeRealRun} from '../tests/real-integration/result-summary.mjs';

// Provisioning and migration are deliberately absent. An approved, attested,
// ready target and own production app process must already exist.
async function main(){
 const mode=process.argv[2]??'--preflight';
 if(!['--preflight','--run'].includes(mode))throw new Blocked('UNKNOWN_RUN_MODE');
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
 const app=fileURLToPath(new URL('../',import.meta.url));
 const selection=target.approval.testSelection;
 if(selection!==undefined&&!['en/desktop','en/mobile','en/','zh-HK/desktop','zh-HK/mobile','zh-HK/','TRAVELLER_CORE_12','STALE_TAB_4','TODAY_SLICE_4'].includes(selection))throw new Blocked('UNAPPROVED_TEST_SELECTION');
 const result=spawnSync(process.execPath,[
  path.join(app,'node_modules/@playwright/test/cli.js'),'test','--config',
  selection==='TODAY_SLICE_4'?'playwright.today-slice.config.ts':selection==='STALE_TAB_4'?'playwright.stale-tab.config.ts':'playwright.real-integration.config.ts',
  ...(selection&&!['TRAVELLER_CORE_12','STALE_TAB_4','TODAY_SLICE_4'].includes(selection)?['--grep','real isolated target '+selection]:[]),
 ],{cwd:app,env:{...process.env,PLAYWRIGHT_NO_COPY_PROMPT:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:8*1024*1024});
 // Do not persist raw stdout/stderr: Auth/browser call logs may contain values.
 const report=assertSafeLedger(summarizeRealRun(result,{
  productHead:target.head,project:target.identity.project,testSelection:selection??'FULL_EXISTING_8',
 }));
 writeFileSync(path.join(output,'RESULT-'+target.approval.runId+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));process.exitCode=report.exitCode;
}
main().catch(error=>{
 const code=error instanceof Blocked?error.code:'PREFLIGHT_INTERNAL_FAILURE';
 console.log(JSON.stringify(assertSafeLedger({status:'BLOCKED',code,realTestsExecuted:false,
  ...(error instanceof Blocked&&error.resourceGate?{resourceGate:error.resourceGate}:{})})));
 process.exitCode=78;
});
