import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {loadEnvFile} from 'node:process';
import {pathToFileURL} from 'node:url';
import {verifyTestTarget} from './verify-test-target.mjs';

const commands={
 unit:['test'],
 integration:['run','test:integration'],
 browser:['exec','playwright','test','--','--config=playwright.connected.config.ts'],
};

/** Only completion counts and source identity enter the artifact, never test output. */
export function summarizeCheck(check,exitCode,output,sourceSha){
 if(!Object.hasOwn(commands,check)||!Number.isInteger(exitCode)||exitCode<0||exitCode>255||!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('Valid check, exit status and full source SHA required');
 const text=output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 const counts={passed:0,failed:0,skipped:0,cancelled:0,todo:0};
 let complete=false;
 if(check==='browser'){
  const values=[...text.matchAll(/^\s*(\d+) passed\s*\(/gm)];
  if(values.length===1){
   counts.passed=Number(values[0][1]);
   for(const key of ['failed','skipped'])counts[key]=Number(text.match(new RegExp('^\\s*(\\d+) '+key+'\\s*$','m'))?.[1]??0);
   complete=counts.passed>0;
  }
 }else{
  const read=name=>[...text.matchAll(new RegExp('^(?:#|ℹ)\\s+'+name+'\\s+(\\d+)\\s*$','gm'))];
  const total=read('tests');
  const fields={passed:'pass',failed:'fail',skipped:'skipped',cancelled:'cancelled',todo:'todo'};
  complete=total.length===1;
  for(const [key,label] of Object.entries(fields)){
   const matches=read(label);complete&&=matches.length===1;
   counts[key]=matches.length===1?Number(matches[0][1]):0;
  }
  complete&&=Number(total[0]?.[1])>0&&Number(total[0]?.[1])===Object.values(counts).reduce((a,b)=>a+b,0);
 }
 const result=exitCode!==0?'FAIL':complete&&counts.failed===0&&counts.cancelled===0?'PASS':'INVALID_EVIDENCE';
 return{schemaVersion:1,check,sourceSha,exitCode,result,counts:complete?counts:null,signedInProductionAcceptance:'NOT_RUN'};
}

function main(check){
 if(!Object.hasOwn(commands,check))throw Error('Use unit, integration or browser');
 const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 let target={environment:process.env.CI==='true'?'ci-source':'local-source'};
 if(check!=='unit'){
  loadEnvFile('.env.test');const verified=verifyTestTarget();
  const db=JSON.parse(execFileSync('docker',['inspect',verified.dbContainer],{encoding:'utf8'}))[0];
  if(!db.State.Running||db.Config.Labels?.['com.supabase.cli.project']!==verified.projectRef)throw Error('Owned local DB required');
  target={environment:'isolated-local',projectRef:verified.projectRef,apiOrigin:verified.apiOrigin};
 }
 // Fixed commands only; the Windows shell receives no caller-provided arguments.
 const run=spawnSync(process.platform==='win32'?'npm.cmd':'npm',commands[check],{
  encoding:'utf8',maxBuffer:16*1024*1024,shell:process.platform==='win32',windowsHide:true,
 });
 process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'');
 const code=run.status??1;
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim()!=='';
 const report={...summarizeCheck(check,code,(run.stdout??'')+'\n'+(run.stderr??''),sourceSha),workingTreeDirty:dirty,target};
 mkdirSync('evidence/ci',{recursive:true});
 writeFileSync(`evidence/ci/${check}.json`,JSON.stringify(report,null,2)+'\n');
 return report.result==='PASS'?0:code||1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=main(process.argv[2]);
