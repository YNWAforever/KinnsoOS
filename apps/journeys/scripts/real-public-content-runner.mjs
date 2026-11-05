import{spawnSync}from 'node:child_process';
import{readFileSync}from 'node:fs';
import path from 'node:path';
import{fileURLToPath}from 'node:url';
import{publicTargetConfiguration,validatePublicApproval}from '../tests/real-public-content/target.mjs';
import{summarizePublicRun}from '../tests/real-public-content/result-summary.mjs';

const app=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2]??'--preflight';
try{
 const target=publicTargetConfiguration(process.env),approvalFile=process.env.KINNSO_REAL_IT_APPROVAL_FILE,attestationFile=process.env.KINNSO_REAL_IT_ATTESTATION_FILE;
 if(!approvalFile)throw Object.assign(Error('APPROVAL_REQUIRED'),{code:'APPROVAL_REQUIRED'});
 if(!attestationFile)throw Object.assign(Error('ATTESTATION_REQUIRED'),{code:'ATTESTATION_REQUIRED'});
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:path.resolve(app,'../..'),encoding:'utf8'}).stdout.trim();
 const approval=JSON.parse(readFileSync(approvalFile,'utf8'));
 validatePublicApproval(approval,head,{env:process.env});
 if(approval.testSelection!=='PUBLIC_CONTENT_8')throw Object.assign(Error('UNAPPROVED_TEST_SELECTION'),{code:'UNAPPROVED_TEST_SELECTION'});
 const env={...process.env,KINNSO_REAL_IT_PROJECT:target.project,KINNSO_REAL_IT_UPSTREAM_PROJECT:target.project,KINNSO_REAL_IT_API_ORIGIN:target.apiOrigin,KINNSO_REAL_IT_APP_ORIGIN:target.appOrigin,KINNSO_REAL_IT_DB_PORT:target.dbPort};
 const result=spawnSync(process.execPath,[path.join(app,'scripts/real-integration-runner.mjs'),mode],{cwd:app,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:8*1024*1024});
 if(mode==='--preflight')process.stdout.write(result.stdout);else process.stdout.write(JSON.stringify(summarizePublicRun(result,{productHead:head,project:target.project}))+'\n');
 process.exitCode=result.status??78;
}catch(error){
 process.stdout.write(JSON.stringify({status:'BLOCKED',code:error.code??'PREFLIGHT_INTERNAL_FAILURE',realTestsExecuted:false})+'\n');process.exitCode=78;
}
