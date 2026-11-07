import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),app=path.join(root,'apps/journeys'),out=path.join(root,'.local-private/browser-candidate-20261105'),project='kinnsoos-suspension-it-20261105';
const cmd=(file,args)=>execFileSync(file,args,{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
const sha=x=>createHash('sha256').update(x).digest('hex');
const containers=JSON.parse(cmd('docker',['inspect',...['db','auth','rest','kong','storage'].map(k=>'supabase_'+k+'_'+project)]));
for(const c of containers){assert.equal(c.Config.Labels['com.supabase.cli.project'],project);assert.equal(c.State.Running,true);assert.deepEqual(Object.keys(c.NetworkSettings.Networks),[project+'-network']);for(const bindings of Object.values(c.NetworkSettings.Ports??{}))for(const b of bindings??[])assert.equal(b.HostIp,'127.0.0.1')}
const db=containers.find(c=>c.Name==='/supabase_db_'+project);
cmd('docker',['exec',db.Id,'psql','-U','supabase_admin','-d','postgres','-c',"alter system set cron.launch_active_jobs='off';"]);
cmd('docker',['exec',db.Id,'psql','-U','supabase_admin','-d','postgres','-c','select pg_reload_conf();']);
const versions=cmd('docker',['exec',db.Id,'psql','-U','supabase_admin','-d','postgres','-Atc','select version from supabase_migrations.schema_migrations order by version']).trim().split(/\r?\n/);
const files=readdirSync(path.join(root,'supabase/migrations')).filter(n=>/^\d{14}_.*\.sql$/.test(n)).sort();assert.deepEqual(versions,files.map(n=>n.slice(0,14)));
const head=cmd('git',['rev-parse','HEAD']).trim(),archive=sha(readFileSync(path.join(app,'public/source/kinnsoos-source.zip'))),runId=randomUUID();
const approval={approved:true,approvalId:'user-request-candidate-specific-browser-environment',runId,productHead:head,project,testSelection:'TRAVELLER_CORE_12'};
writeFileSync(path.join(out,'approval.json'),JSON.stringify(approval,null,2));
const status=JSON.parse(cmd(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',out,'--output','json']));
assert.equal(status.API_URL,'http://127.0.0.1:59621');
const env={...process.env,NODE_ENV:'production',KINNSO_ENVIRONMENT:'local',KINNSO_SITE_URL:'http://127.0.0.1:3498',KINNSO_SUPABASE_URL:status.API_URL,KINNSO_APPROVED_SUPABASE_ORIGIN:status.API_URL,KINNSO_LEGACY_AUTH_ORIGIN:status.API_URL,KINNSO_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,KINNSO_SUPABASE_SECRET_KEY:status.SERVICE_ROLE_KEY,KINNSO_ENABLED_CAPABILITIES:'trips,bookmarks,creator',KINNSO_SYNTHETIC_RUN:'true',KINNSO_NATIVE_TEST_PROJECT:project,KINNSO_NATIVE_LEDGER:path.join(out,'fixtures.json'),KINNSO_REAL_IT_PROJECT:project,KINNSO_REAL_IT_API_ORIGIN:status.API_URL,KINNSO_REAL_IT_APP_ORIGIN:'http://127.0.0.1:3498',KINNSO_REAL_IT_DB_PORT:'59622',KINNSO_REAL_IT_APPROVAL_FILE:path.join(out,'approval.json')};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3498'],{cwd:app,env,windowsHide:true,stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<40;i++){if(server.exitCode!==null)throw Error('APP_EXITED');try{const r=await fetch('http://127.0.0.1:3498/source/kinnsoos-source.zip');if(r.ok&&sha(Buffer.from(await r.arrayBuffer()))===archive){ready=true;break}}catch{/* app not ready */ }await new Promise(r=>setTimeout(r,500))}assert.ok(ready,'app not ready');
 const testSources=['apps/journeys/tests/real-integration/native-fixture.mjs','apps/journeys/tests/real-integration/native-journey.spec.ts','apps/journeys/playwright.native-release.config.ts','scripts/run-native-release-browser.mjs'];
 const attestation={testSources:Object.fromEntries(testSources.map(f=>[f,sha(readFileSync(path.join(root,f)))])),head,project,runId,buildId:readFileSync(path.join(app,'.next/BUILD_ID'),'utf8').trim(),archiveSha256:archive,appPid:server.pid,appOrigin:env.KINNSO_SITE_URL,apiOrigin:status.API_URL,containers:containers.map(c=>({id:c.Id,name:c.Name,image:c.Image})),migrations:files.map(name=>({name,sha256:sha(readFileSync(path.join(root,'supabase/migrations',name)))})),productionChanged:false};
 writeFileSync(path.join(out,'ATTESTATION.json'),JSON.stringify(attestation,null,2));
 const test=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.native-release.config.ts','--max-failures=1'],{cwd:app,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs='';test.stdout.on('data',b=>logs+=b);test.stderr.on('data',b=>logs+=b);const exit=await new Promise(r=>test.on('close',r));
 // No credential values or transport logs are printed.
 for(const secret of [status.ANON_KEY,status.SERVICE_ROLE_KEY])if(secret)logs=logs.split(secret).join('[redacted]');
 writeFileSync(path.join(out,'browser-result-private.log'),logs);
 console.log(JSON.stringify({project,head,attestationWritten:true,browserExit:exit,resultLog:path.join(out,'browser-result-private.log')}));process.exitCode=exit??1;
}finally{server.kill()}

