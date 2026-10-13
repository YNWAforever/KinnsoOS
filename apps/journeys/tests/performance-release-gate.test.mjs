import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {pages,workspacePages,operationRole,assessRun} from '../scripts/performance/report.mjs';
const script=fileURLToPath(new URL('../scripts/performance/assert-operations-assessment.mjs',import.meta.url));
function fixture(){
 const cwd=mkdtempSync(path.join(tmpdir(),'kinnso-performance-gate-'));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 git('init','--quiet');git('config','user.name','Owned test');git('config','user.email','owned@example.test');
 writeFileSync(path.join(cwd,'source'),'original');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
 writeFileSync(path.join(cwd,'source'),'candidate');git('commit','-qam','candidate');const head=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
 const merged=git('commit-tree',tree,'-p',base,'-p',head,'-m','owned synthetic PR merge');
 const report={kind:'operations',sourceSha:head,sourceDiff:[],conditions:{formFactor:'mobile',throttlingMethod:'devtools',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:1,disabled:false},throttling:{requestLatencyMs:150,downloadThroughputKbps:1600,uploadThroughputKbps:750,cpuSlowdownMultiplier:4}},dataset:{campaigns:55,acceptedCreatorWork:55,reviewSubmissions:1,roles:['creator','merchant_owner']},cleanup:'PASS_OWNED_SYNTHETIC_ACTORS_REMOVED',samples:[],interactions:[],queryLatency:{status:'MEASURED_LOCAL_BACKEND_ROUNDTRIPS',samples:[]}};
 for(const page of [...pages,...workspacePages]){
  const role=operationRole(page);report.interactions.push({page,role,status:'PASS',traceFile:page+'.trace.json'});
  for(let run=1;run<=3;run++){report.queryLatency.samples.push({page,role,run,status:'PASS',durationMs:20});for(const cache of ['cold','warm'])report.samples.push({page,role,cache,run,status:200,verified:true,lcpMs:2000,cls:0.05,tbtMs:10,jsTransferBytes:100,imageTransferBytes:0});}
 }
 report.assessment=assessRun(report);
 const file=path.join(cwd,'.git','owned-report.json');
 const run=(value=report,expected=head,candidate=head,against='')=>{writeFileSync(file,JSON.stringify(value));return spawnSync(process.execPath,[script,file,expected,candidate,against],{cwd,encoding:'utf8'});};
 return{cwd,git,base,head,merged,report,run,cleanup:()=>rmSync(cwd,{recursive:true,force:true})};
}
test('W07 accepts a complete clean operations report tied to the measured source',()=>{const f=fixture();try{const r=f.run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PASS/);}finally{f.cleanup();}});
test('W07 refuses slow, missing, forged summary, wrong role, failed cleanup and unknown source',()=>{const f=fixture();try{
 const changes=[r=>{r.assessment.status='FAIL';},r=>{delete r.conditions;},r=>{r.conditions.throttling.cpuSlowdownMultiplier=1;},r=>{r.dataset.campaigns=1;},r=>{r.samples[0].lcpMs=6000;r.samples[1].lcpMs=6000;r.samples[2].lcpMs=6000;},r=>{r.samples.pop();},r=>{r.interactions.pop();},r=>{r.queryLatency.samples.pop();},r=>{r.samples[0].verified=false;},r=>{r.samples[0].role='other';},r=>{r.cleanup='PENDING';},r=>{r.sourceDiff=['changed.ts'];},r=>{r.sourceSha='0'.repeat(40);},r=>{r.samples.push(r.samples[0]);},r=>{r.error='retained original collection failure';}];
 for(const change of changes){const r=structuredClone(f.report);change(r);const result=f.run(r);assert.notEqual(result.status,0,change.toString());assert.match(result.stderr,/Operations release gate rejected/,result.stderr);}
 assert.notEqual(f.run(f.report,'0'.repeat(40)).status,0);
}finally{f.cleanup();}});
test('W07 verifies PR parents and identical candidate tree; a matching label alone cannot pass',()=>{const f=fixture();try{
 f.git('checkout','--quiet','--detach',f.merged);const r={...f.report,sourceSha:f.merged};
 assert.equal(f.run(r,f.merged,f.head,f.base).status,0);
 assert.notEqual(f.run(r,f.merged,f.head).status,0);
 assert.notEqual(f.run(r,f.merged,f.base,f.head).status,0);
 const wrongTree=f.git('rev-parse',f.base+'^{tree}'),wrong=f.git('commit-tree',wrongTree,'-p',f.base,'-p',f.head,'-m','different merge source');f.git('checkout','--quiet','--detach',wrong);
 assert.notEqual(f.run({...r,sourceSha:wrong},wrong,f.head,f.base).status,0);
}finally{f.cleanup();}});
test('W07 refuses dirty tracked, staged and untracked source even if the report claims an empty diff',()=>{const f=fixture();try{
 writeFileSync(path.join(f.cwd,'source'),'dirty');assert.notEqual(f.run().status,0);f.git('add','source');assert.notEqual(f.run().status,0);f.git('reset','--hard','HEAD');
 writeFileSync(path.join(f.cwd,'extra-source'),'untracked');assert.notEqual(f.run().status,0);
}finally{f.cleanup();}});
