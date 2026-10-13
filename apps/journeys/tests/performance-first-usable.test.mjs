import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync}from'node:fs';
import {tmpdir}from'node:os';
import path from'node:path';
import{fileURLToPath}from'node:url';
import{spawnSync}from'node:child_process';
import {assessRun,pages,workspacePages,operationRole} from '../scripts/performance/report.mjs';
const first=await import('../scripts/performance/first-usable.mjs').catch(()=>({}));
const comparison=await import('../scripts/performance/compare-operations.mjs').catch(()=>({}));
const tasks=['merchantInvitation','merchantBrief','merchantReview'];
const shaA='a'.repeat(40),shaB='b'.repeat(40),treeA='c'.repeat(40),treeB='e'.repeat(40),hash='d'.repeat(64);
const cleanup='PASS_OWNED_SYNTHETIC_ACTORS_REMOVED';
const context={sourceSha:shaA,sourceTree:treeA,conditionsHash:hash,cleanup};
const samples=()=>tasks.flatMap(task=>['cold','warm'].flatMap(cache=>[1,2,3].map(run=>({task,cache,run,acceptedInputMs:[100,120,140][run-1],retained:true,authorized:true,status:'PASS'}))));
function summarize(rows,ctx=context){assert.equal(typeof first.summarizeFirstUsable,'function','first-usable evaluator must exist');return first.summarizeFirstUsable(rows,ctx);}
function report(sourceSha){
 const r={kind:'operations',sourceSha,sourceDiff:[],cleanup,samples:[],interactions:[],queryLatency:{status:'MEASURED_LOCAL_BACKEND_ROUNDTRIPS',samples:[]},dataset:{campaigns:55,acceptedCreatorWork:55,reviewSubmissions:1,roles:['creator','merchant_owner']},conditions:{formFactor:'mobile',throttlingMethod:'devtools',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:1,disabled:false},throttling:{requestLatencyMs:150,downloadThroughputKbps:1600,uploadThroughputKbps:750,cpuSlowdownMultiplier:4}}};
 for(const page of [...pages,...workspacePages]){const role=operationRole(page);r.interactions.push({page,role,status:'PASS',traceFile:page+'.trace.json'});for(const run of [1,2,3]){r.queryLatency.samples.push({page,role,run,status:'PASS',durationMs:20});for(const cache of ['cold','warm'])r.samples.push({page,role,cache,run,status:200,verified:true,lcpMs:2000,cls:0.05,tbtMs:10,jsTransferBytes:100,imageTransferBytes:0});}}
 r.assessment=assessRun(r);return r;
}
function batch(){const conditionsHash=createHash('sha256').update(JSON.stringify(report(shaA).conditions)).digest('hex');return{protocol:{schemaVersion:1,order:['A1','B1','B2','A2'],conditionsHash,toolHash:hash,instrumentationHash:hash,hostHash:hash,nonRegression:{absoluteMs:50,relative:0.05},baseline:{sourceSha:shaA,sourceTree:treeA}},runs:['A1','B1','B2','A2'].map(id=>{const sourceSha=id.startsWith('A')?shaA:shaB,sourceTree=id.startsWith('A')?treeA:treeB;return{id,sourceSha,sourceTree,conditionsHash,toolHash:hash,instrumentationHash:hash,hostHash:hash,report:report(sourceSha),sidecar:summarize(samples().map(x=>({...x,acceptedInputMs:id.startsWith('A')?1000:1050})),{...context,sourceSha,sourceTree,conditionsHash})};})};}
function compare(value){assert.equal(typeof comparison.compareOperationsBatch,'function','ABBA comparator must exist');return comparison.compareOperationsBatch(value);}
// Removing a required slot or trusting a transient/unauthorized input must break acceptance.
test('NEXT02 only eighteen unique authorized retained input samples produce six complete groups',()=>{const r=summarize(samples());assert.equal(r.status,'PASS');assert.equal(r.samples.length,18);assert.equal(r.groups.length,6);assert.ok(r.groups.every(x=>x.samples===3&&x.medianAcceptedInputMs===120));});
test('NEXT02 missing, duplicate, malformed and failed input slots never earn first-usable acceptance',()=>{
 const changes=[r=>r.pop(),r=>{r[17]={...r[0]};},r=>{r[0].task='unknown';},r=>{r[0].cache='other';},r=>{r[0].run=4;},r=>{r[0].acceptedInputMs=Infinity;},r=>{r[0].acceptedInputMs=-1;},r=>{r[0].acceptedInputMs=null;},r=>{r[0].authorized=false;},r=>{r[0].retained=false;},r=>{r[0].status='FAIL';}];
 for(const mutate of changes){const r=samples();mutate(r);assert.notEqual(summarize(r).status,'PASS',mutate.toString());}
 for(const bad of [{sourceSha:'unknown'},{sourceTree:'unknown'},{conditionsHash:'unknown'},{cleanup:'PENDING'}])assert.notEqual(summarize(samples(),{...context,...bad}).status,'PASS');
});
// Different hosts, orders or source bindings are not causal comparisons.
test('NEXT02 ABBA accepts only complete matching instrumentation and the fixed non-regression boundary',()=>{const value=batch();for(const r of value.runs.filter(x=>x.id.startsWith('A'))){for(const s of r.report.samples.filter(x=>x.page==='merchantCampaigns'&&x.cache==='cold'))s.lcpMs=2700;r.report.assessment=assessRun(r.report);}const result=compare(value);assert.equal(result.status,'PASS');assert.equal(result.groups.length,6);assert.ok(result.groups.every(x=>x.aSamples===6&&x.bSamples===6&&x.aMedianMs===1000&&x.bMedianMs===1050&&x.limitMs===1050));assert.equal(value.runs[0].report.assessment.status,'FAIL','valid slow baseline remains retained');});
test('NEXT02 altered order, source, tools, host, conditions or missing evidence is incomparable',()=>{
 const changes=[b=>{b.runs.reverse();},b=>{b.runs.pop();},b=>{b.runs[1].report.dataset.campaigns=56;},b=>{b.runs[0].report.sourceSha=shaB;},b=>{b.runs[3].sourceTree=treeB;},b=>{b.runs[1].sidecar.sourceSha=shaA;},b=>{b.runs[1].conditionsHash='f'.repeat(64);},b=>{b.runs[1].hostHash='f'.repeat(64);},b=>{b.runs[1].toolHash='f'.repeat(64);},b=>{b.runs[1].instrumentationHash='f'.repeat(64);},b=>{b.runs[1].report.conditions.throttling.cpuSlowdownMultiplier=1;},b=>{b.runs[1].report.samples.pop();},b=>{b.runs[1].sidecar.samples.pop();},b=>{b.protocol.nonRegression.relative=0.10;}];
 for(const mutate of changes){const b=batch();mutate(b);assert.equal(compare(b).status,'INCOMPARABLE',mutate.toString());}
});
test('NEXT02 numeric failure, cleanup failure or first-input regression rejects the candidate without choosing a faster run',()=>{
 for(const mutate of [b=>{for(const s of b.runs[2].report.samples.filter(x=>x.page==='merchantReview'&&x.cache==='cold'))s.lcpMs=2600;b.runs[2].report.assessment=assessRun(b.runs[2].report);},b=>{b.runs[2].report.cleanup='PENDING';},b=>{for(const r of b.runs.filter(x=>x.id.startsWith('B')))for(const s of r.sidecar.samples.filter(x=>x.task==='merchantBrief'&&x.cache==='cold'))s.acceptedInputMs=1051;}]){const b=batch();mutate(b);assert.notEqual(compare(b).status,'PASS',mutate.toString());}
});

test('NEXT02 matching labels cannot hide a changed actual conditions payload',()=>{const b=batch();for(const run of b.runs)run.report.conditions.cacheDefinition='changed after freeze';assert.equal(compare(b).status,'INCOMPARABLE');});

test('NEXT02 executable sidecar gate rejects missing slots, forged source and cleanup without borrowing navigation PASS',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'kinnso-first-usable-gate-')),file=path.join(dir,'report.json'),sidecar=path.join(dir,'first-usable.json'),script=fileURLToPath(new URL('../scripts/performance/first-usable.mjs',import.meta.url));
 const r={...report(shaA),sourceTree:treeA},conditionsHash=createHash('sha256').update(JSON.stringify(r.conditions)).digest('hex'),value=summarize(samples(),{...context,conditionsHash});
 const run=v=>{writeFileSync(file,JSON.stringify(r));writeFileSync(sidecar,JSON.stringify(v));return spawnSync(process.execPath,[script,file,shaA],{encoding:'utf8'});};
 try{const valid=run(value);assert.equal(valid.status,0,valid.stderr);assert.match(valid.stdout,/'?PASS'?/);for(const mutate of [s=>{s.samples.pop();},s=>{s.sourceSha=shaB;},s=>{s.cleanup='PENDING';}]){const bad=structuredClone(value);mutate(bad);assert.notEqual(run(bad).status,0,'new sidecar cannot borrow the report PASS');}}finally{rmSync(dir,{recursive:true,force:true});}
});
