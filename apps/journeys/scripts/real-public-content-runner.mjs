import{spawnSync}from 'node:child_process';
import{mkdirSync,writeFileSync}from 'node:fs';
import path from 'node:path';
import{fileURLToPath}from 'node:url';
import{assertSafePublicEvidence,verifyPublicTarget}from '../tests/real-public-content/target.mjs';
import{summarizePublicRun}from '../tests/real-public-content/result-summary.mjs';

const app=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2]??'--preflight';
try{
 if(!['--preflight','--run'].includes(mode))throw Object.assign(Error('UNKNOWN_RUN_MODE'),{code:'UNKNOWN_RUN_MODE'});
 const verified=await verifyPublicTarget(process.env);
 if(verified.approval.testSelection!=='PUBLIC_CONTENT_8')throw Object.assign(Error('UNAPPROVED_TEST_SELECTION'),{code:'UNAPPROVED_TEST_SELECTION'});
 if(mode==='--preflight'){
  process.stdout.write(JSON.stringify(assertSafePublicEvidence({status:'READY_FOR_REAL_TESTS',productHead:verified.head,project:verified.target.project,migrations:verified.migrations,baseline:verified.baseline}))+'\n');return;
 }
 const output=process.env.KINNSO_REAL_IT_EVIDENCE;
 if(!output)throw Object.assign(Error('EVIDENCE_DIRECTORY_REQUIRED'),{code:'EVIDENCE_DIRECTORY_REQUIRED'});
 try{mkdirSync(output)}catch{throw Object.assign(Error('FRESH_EVIDENCE_DIRECTORY_REQUIRED'),{code:'FRESH_EVIDENCE_DIRECTORY_REQUIRED'})}
 writeFileSync(path.join(output,'RUN.json'),JSON.stringify(assertSafePublicEvidence({runId:verified.approval.runId,productHead:verified.head,project:verified.target.project,identity:verified.identity}),null,2)+'\n',{flag:'wx'});
 const result=spawnSync(process.execPath,[path.join(app,'node_modules/@playwright/test/cli.js'),'test','--config','playwright.public-content.config.ts','--grep','real isolated target PUBLIC_CONTENT_8'],{cwd:app,env:{...process.env,PLAYWRIGHT_NO_COPY_PROMPT:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:8*1024*1024});
 const report=summarizePublicRun(result,{productHead:verified.head,project:verified.target.project});
 writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=report.exitCode;
}catch(error){
 process.stdout.write(JSON.stringify({status:'BLOCKED',code:error.code??'PREFLIGHT_INTERNAL_FAILURE',realTestsExecuted:false})+'\n');process.exitCode=78;
}
