import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as preparation from '../scripts/pilot-preparation.mjs';
const {actorAliases,assessPilotPreparation}=preparation;
const template=JSON.parse(fs.readFileSync(new URL('../scripts/pilot-preparation.template.json',import.meta.url),'utf8'));
const sourceRevision='a'.repeat(40),now=Date.parse('2026-10-23T05:00:00Z');
const assess=p=>assessPilotPreparation(p,{sourceRevision,now});
const blocked=(p,id)=>assert.ok(assess(p).checks.some(c=>c.id===id&&c.status==='BLOCKED'),id);
function complete(){
 const p=structuredClone(template);p.sourceRevision=sourceRevision;p.environmentOption='existing_project_bounded_cohort';p.forbiddenProjectRefs=['p'.repeat(20)];p.selectedExistingProjectRef='s'.repeat(20);
 for(const [id,selection] of Object.entries({D01:'KEEP_CURRENT_NOTICE',D02:'A',D03:'A',D04:'EXISTING_REMIX_KINNSO',D05:'A',D06:'A'}))p.decisions[id]={selection,reference:'synthetic/decision-'+id};
 p.companies.forEach((c,i)=>c.identityRef='private/company-'+i);
 Object.assign(p.targets.staging,{kind:'existing_shared_project',projectRef:'s'.repeat(20),apiOrigin:'https://'+'s'.repeat(20)+'.supabase.co',ownerRef:'private/owner',managementRef:'private/management-shared',transportRef:'private/transport-shared',cohortRef:'private/exact-synthetic-cohort',observedAt:new Date(now).toISOString()});
 Object.assign(p.targets.restore,{kind:'owned_local',projectRef:'kinnsoos-rehearsal-012345abcdef',apiOrigin:'http://127.0.0.1:59421',ownerRef:'private/owner',managementRef:'private/container-metadata',transportRef:'private/port-mapping',ownershipMarkerRef:'private/ownership-marker',unlinked:true,observedAt:new Date(now).toISOString()});
 p.actors.forEach((a,i)=>a.identityRef='private/actor-'+i);p.recovery={ownerRef:'private/recovery-owner',serviceObjective:'NOT_PROMISED',rpoMinutes:null,rtoMinutes:null};Object.assign(p.scope,{policyActivation:'NOT_AUTHORIZED',optionalProcessing:'NO_NEW',existingFourTaskAi:'UNCHANGED'});return p;
}
test('recorded user directions do not substitute for missing private operational evidence',()=>{
 const x=assess(template);assert.equal(x.status,'BLOCKED_INPUTS');assert.equal(x.schemaStatus,'not_checked');assert.equal(x.realContentStatus,'BLOCKED');assert.equal(x.runtimeStatus,'NOT_RUN');assert.deepEqual(x.authorizedActions,[]);
 for(const id of ['D01','D02','D03','D04','D05','D06'])assert.ok(x.checks.some(c=>c.id===id&&c.status==='PASS'),id);
 for(const id of ['SOURCE_BINDING','TARGET_IDENTITY','ACTOR_MATRIX','RECOVERY_PREPARATION'])blocked(template,id);
 assert.equal(template.recovery.ownerRef,null);assert.equal(template.recovery.rpoMinutes,null);assert.equal(template.recovery.rtoMinutes,null);
});
test('complete private references allow review only and confer no execution authority',()=>{
 const x=assess(complete());assert.equal(x.status,'REVIEWABLE_NOT_EXECUTABLE');assert.deepEqual(x.authorizedActions,[]);assert.equal(x.schemaStatus,'not_checked');assert.equal(x.runtimeStatus,'NOT_RUN');assert.equal(actorAliases.length,14);assert.equal(x.isolationStatus,'SHARED_BACKEND_NOT_ISOLATED_STAGING');assert.equal(x.fullRestoreStatus,'NOT_RUN');
});
test('references from another candidate cannot qualify the packet',()=>{const p=complete();p.sourceRevision='b'.repeat(40);blocked(p,'SOURCE_BINDING');});
test('selected original target cannot drift and cloud target cannot be used for local restore',()=>{const p=complete();p.targets.restore=structuredClone(p.targets.staging);blocked(p,'DISTINCT_TARGETS');const q=complete();q.forbiddenProjectRefs.push(q.targets.staging.projectRef);blocked(q,'DISTINCT_TARGETS');});
test('matching origin strings alone cannot replace independent metadata evidence',()=>{const p=complete();p.targets.staging.transportRef=p.targets.staging.managementRef;blocked(p,'TARGET_IDENTITY');const q=complete();q.targets.staging.ownerRef=null;blocked(q,'TARGET_IDENTITY');});
test('ref/origin disagreement, credentials, paths and plain HTTP are rejected',()=>{for(const origin of ['https://different.supabase.co','https://user:pass@'+ 's'.repeat(20)+'.supabase.co','https://'+'s'.repeat(20)+'.supabase.co/path','http://'+'s'.repeat(20)+'.supabase.co']){const p=complete();p.targets.staging.apiOrigin=origin;blocked(p,'TARGET_IDENTITY');}});
test('identity observations expire and future timestamps do not pass',()=>{for(const offset of [-900001,1001]){const p=complete();p.targets.staging.observedAt=new Date(now+offset).toISOString();blocked(p,'TARGET_IDENTITY');}});
test('actors need unique private identities and actual persona/company role mapping',()=>{const p=complete();p.actors[1].identityRef=p.actors[0].identityRef;blocked(p,'ACTOR_MATRIX');const q=complete();q.actors.find(a=>a.alias==='a-marketing').membershipRole='owner';blocked(q,'ACTOR_MATRIX');});
test('omitted actor or duplicate company reference is blocked',()=>{const p=complete();p.actors.pop();blocked(p,'ACTOR_MATRIX');const q=complete();q.companies[1].identityRef=q.companies[0].identityRef;blocked(q,'ACTOR_MATRIX');});
test('unselected environment and missing decisions remain missing despite label or name',()=>{const p=complete();p.environmentOption='shared_staging';blocked(p,'D04');p.environmentOption='existing_project_bounded_cohort';p.decisions.D02=null;blocked(p,'D02');});
test('D06 A prepares a measured subset rehearsal with no promised RPO or RTO',()=>{
 const x=assess(complete());assert.equal(x.status,'REVIEWABLE_NOT_EXECUTABLE');assert.deepEqual(x.authorizedActions,[]);assert.equal(x.fullRestoreStatus,'NOT_RUN');
});

test('D06 A does not accept invented service goals or omit recovery ownership',()=>{
 for(const v of [0,-1,240,'240',Infinity]){const p=complete();p.recovery.rpoMinutes=v;p.recovery.rtoMinutes=v;blocked(p,'RECOVERY_PREPARATION');}
 const p=complete();p.recovery.ownerRef=null;blocked(p,'RECOVERY_PREPARATION');
 const q=complete();q.recovery.serviceObjective='PROMISED';blocked(q,'RECOVERY_PREPARATION');
});

test('decision references cannot silently change the directions selected by the user',()=>{
 for(const [id,selection] of [['D01','A'],['D02','B'],['D03','B'],['D04','NEW_SUPABASE_PROJECTS'],['D05','B'],['D06','B']]){const p=complete();p.decisions[id].selection=selection;blocked(p,id);}
 const p=complete();delete p.decisions.D03.selection;blocked(p,'D03');
});

test('keeping the notice and existing four AI tasks blocks policy activation or new optional processing',()=>{
 for(const [key,value] of [['policyActivation','APPROVED'],['optionalProcessing','ENABLED'],['existingFourTaskAi','DISABLED'],['existingFourTaskAi','NEW_PROVIDER']]){const p=complete();p.scope[key]=value;blocked(p,'SCOPE');}
});
test('user-supplied ready or content success flags cannot clear unperformed gates',()=>{const p=complete();p.scope.schema='ready';p.scope.realContent='PASS';p.scope.runtime='PASS';blocked(p,'SCOPE');assert.equal(assess(p).schemaStatus,'not_checked');});
test('credentials are rejected and never reflected in report',()=>{const p=complete();p.password='do-not-reflect-private-password';p.targets.staging.token='sb_secret_do-not-reflect';const x=assess(p);assert.equal(x.status,'BLOCKED_INPUTS');blocked(p,'NON_SECRET_PACKET');assert.ok(!JSON.stringify(x).includes('do-not-reflect'));});
test('malformed input cannot throw or create a qualified result',()=>{for(const p of [null,[],{},'invalid'])assert.equal(assess(p).status,'BLOCKED_INPUTS');});
test('new Supabase projects stay prohibited after the user selected original project',()=>{const p=complete();p.environmentOption='new_supabase_projects';blocked(p,'D04');});
test('existing backend requires exact cohort and selected-project binding',()=>{const p=complete();p.targets.staging.cohortRef=null;blocked(p,'TARGET_IDENTITY');const q=complete();q.selectedExistingProjectRef='q'.repeat(20);blocked(q,'DISTINCT_TARGETS');});
test('cloud reset, schema changes and full restore claims cannot be enabled by packet',()=>{for(const [k,v] of [['cloudResetSeedCleanup','ALLOWED'],['schemaChanges','ALLOWED'],['opsGlobalGrant','ALLOWED'],['restoreCoverage','FULL_PRODUCTION']]){const p=complete();p.scope[k]=v;blocked(p,'SCOPE');}const p=complete();p.targets.restore.unlinked=false;blocked(p,'TARGET_IDENTITY');});
test('surrounding whitespace cannot hide reused actor/company/observation references',()=>{
 const p=complete();p.actors[1].identityRef=p.actors[0].identityRef+' ';blocked(p,'ACTOR_MATRIX');
 const q=complete();q.companies[1].identityRef=q.companies[0].identityRef+' ';blocked(q,'ACTOR_MATRIX');
 const v=complete();v.targets.staging.transportRef=v.targets.staging.managementRef+' ';blocked(v,'TARGET_IDENTITY');
});
test('padded and embedded credentials are blocked without reflecting private values',()=>{
 for(const value of [' sb_secret_SYNTHETIC_ONLY','private/prefix postgres://synthetic:demo@invalid.local/db','Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.']){
  const p=complete();p.targets.staging.ownerRef=value;blocked(p,'NON_SECRET_PACKET');assert.ok(!JSON.stringify(assess(p)).includes(value));
 }
});
test('malformed company entries return blocked instead of throwing',()=>{const p=complete();p.companies[0]=null;assert.doesNotThrow(()=>assess(p));blocked(p,'ACTOR_MATRIX');});
test('incomplete standalone metadata cannot borrow a declared or ancestor Git revision',async()=>{
 assert.equal(typeof preparation.resolveCandidateRevision,'function');
 const base=path.resolve(fileURLToPath(new URL('../evidence/pd-20261023/',import.meta.url)));fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'source-binding-'));
 try{
  const meta=path.join(dir,'SOURCE_METADATA.json');fs.writeFileSync(meta,JSON.stringify({sourceRevision:'c'.repeat(40),dirty:false}));
  assert.equal(await preparation.resolveCandidateRevision(dir),null);
  fs.writeFileSync(meta,JSON.stringify({sourceRevision:'c'.repeat(40),dirty:true}));assert.equal(await preparation.resolveCandidateRevision(dir),null);
  fs.writeFileSync(meta,'malformed');assert.equal(await preparation.resolveCandidateRevision(dir),null);
  fs.unlinkSync(meta);assert.equal(await preparation.resolveCandidateRevision(dir),null);
 }finally{assert.equal(path.dirname(path.resolve(dir)),base);fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI malformed JSON is sanitized and missing decisions exit blocked',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kinnso-prep-'));try{const packet=path.join(dir,'input.json'),cli=fileURLToPath(new URL('../scripts/pilot-preparation.mjs',import.meta.url));fs.writeFileSync(packet,'{private-do-not-reflect');let x=spawnSync(process.execPath,[cli,'--packet',packet],{encoding:'utf8'});assert.equal(x.status,1);assert.ok(!String(x.stdout+x.stderr).includes('do-not-reflect'));fs.writeFileSync(packet,JSON.stringify(template));x=spawnSync(process.execPath,[cli,'--packet',packet],{encoding:'utf8'});assert.equal(x.status,2);assert.equal(JSON.parse(x.stdout).runtimeStatus,'NOT_RUN');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('actual pilot CLI rejects packet growth after metadata inspection within its byte cap',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kinnso-pilot-packet-cap-'));
 const actual=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());
 t.after(()=>{assert.equal(path.dirname(actual).toLowerCase(),parent.toLowerCase());assert.ok(path.basename(actual).startsWith('kinnso-pilot-packet-cap-'));fs.rmSync(actual,{recursive:true});});
 const packet=path.join(root,'packet.json');fs.writeFileSync(packet,'{}');
 const harness=`
 import fs from 'node:fs'; import {pathToFileURL} from 'node:url';
 const [pilot,packet]=process.argv.slice(1),cap=262144;
 const originalStat=fs.statSync,originalFstat=fs.fstatSync,originalOpen=fs.openSync,originalRead=fs.readSync,originalWhole=fs.readFileSync;
 let grew=false,bytesRead=0,packetFd=null,whole=false;
 const grow=()=>{if(!grew){grew=true;fs.appendFileSync(packet,' '.repeat(cap+1024));}};
 fs.statSync=(file,...args)=>{const r=originalStat(file,...args);if(file===packet)grow();return r;};
 fs.openSync=(file,...args)=>{const fd=originalOpen(file,...args);if(file===packet)packetFd=fd;return fd;};
 fs.fstatSync=(fd,...args)=>{const r=originalFstat(fd,...args);if(fd===packetFd)grow();return r;};
 fs.readFileSync=(file,...args)=>{const selected=file===packet||file===packetFd;whole=selected;try{const r=originalWhole(file,...args);if(selected)bytesRead+=Buffer.byteLength(r);return r;}finally{whole=false;}};
 fs.readSync=(fd,...args)=>{const n=originalRead(fd,...args);if(fd===packetFd&&!whole)bytesRead+=n;return n;};
 process.argv=[process.execPath,pilot,'--packet',packet];await import(pathToFileURL(pilot).href);
 console.log(JSON.stringify({grew,bytesRead}));
 `;
 const r=spawnSync(process.execPath,['--input-type=module','--eval',harness,fileURLToPath(new URL('../scripts/pilot-preparation.mjs',import.meta.url)),packet],{encoding:'utf8'});
 assert.equal(r.signal,null,r.stderr);
 const [report,probe]=r.stdout.trim().split(/\r?\n/).map(x=>JSON.parse(x));
 assert.equal(probe.grew,true,'the actual file grew after its initial metadata was captured');
 assert.ok(probe.bytesRead<=262145,`unbounded packet read: ${probe.bytesRead} bytes`);
 assert.equal(r.status,1,r.stdout);assert.equal(report.status,'INVALID_PACKET');
 assert.deepEqual(report.authorizedActions,[]);assert.equal(report.runtimeStatus,'NOT_RUN');
});



test('actual pilot CLI accepts its exact packet byte boundary without granting actions',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kinnso-pilot-boundary-')),actual=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());
 t.after(()=>{assert.equal(path.dirname(actual).toLowerCase(),parent.toLowerCase());assert.ok(path.basename(actual).startsWith('kinnso-pilot-boundary-'));fs.rmSync(actual,{recursive:true});});
 const packet=path.join(root,'packet.json');fs.writeFileSync(packet,'{}'+' '.repeat(262144-2));
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/pilot-preparation.mjs',import.meta.url)),'--packet',packet],{encoding:'utf8'});
 assert.equal(r.status,2,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.status,'BLOCKED_INPUTS');assert.deepEqual(report.authorizedActions,[]);
});

test('actual pilot CLI rejects an already oversized packet without exposing its bytes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kinnso-pilot-oversized-')),actual=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());
 t.after(()=>{assert.equal(path.dirname(actual).toLowerCase(),parent.toLowerCase());assert.ok(path.basename(actual).startsWith('kinnso-pilot-oversized-'));fs.rmSync(actual,{recursive:true});});
 const packet=path.join(root,'packet.json');fs.writeFileSync(packet,'{}'+' '.repeat(262144-1));
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/pilot-preparation.mjs',import.meta.url)),'--packet',packet],{encoding:'utf8'});
 assert.equal(r.status,1,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.status,'INVALID_PACKET');assert.deepEqual(report.authorizedActions,[]);
});

test('actual pilot CLI rejects a directory packet and retains a non-echoing failure',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kinnso-pilot-directory-')),actual=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());
 t.after(()=>{assert.equal(path.dirname(actual).toLowerCase(),parent.toLowerCase());assert.ok(path.basename(actual).startsWith('kinnso-pilot-directory-'));fs.rmSync(actual,{recursive:true});});
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/pilot-preparation.mjs',import.meta.url)),'--packet',root],{encoding:'utf8'});
 assert.equal(r.status,1,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.status,'INVALID_PACKET');assert.deepEqual(report.authorizedActions,[]);assert.ok(!r.stdout.includes(root));
});
