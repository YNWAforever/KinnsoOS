import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {createWriteStream, existsSync} from 'node:fs';
import {execFileSync, spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID, createHash} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {verifyTestTarget} from '../verify-test-target.mjs';
import {assessLatency, validateLatencyBudget, localOrigin, pages} from './report.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = localOrigin('http://127.0.0.1:3523');
loadEnvFile(path.join(app, '.env.test'));
const target = verifyTestTarget();
const inspect = JSON.parse(execFileSync('docker', ['inspect', target.dbContainer], {encoding:'utf8'}))[0];
if (!inspect.State.Running || inspect.Config.Labels['com.supabase.cli.project'] !== target.projectRef)
  throw Error('Owned isolated database identity is required');
if (!existsSync(path.join(app, '.next/BUILD_ID'))) throw Error('A local production build is required');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:app, encoding:'utf8'}).trim();
const archivePath = path.join(app,'public/source/kinnsoos-source.zip');
const metadata = JSON.parse(execFileSync('python',['-c',
  'import json,sys,zipfile; print(json.dumps(json.loads(zipfile.ZipFile(sys.argv[1]).read("SOURCE_METADATA.json"))))',archivePath],{encoding:'utf8'}));
if(metadata.sourceRevision!==sourceSha || (await stat(path.join(app,'.next/BUILD_ID'))).mtimeMs < (await stat(archivePath)).mtimeMs)
  throw Error('The selected build must follow source packaging on this current head');
for(const [name,sha256] of Object.entries(metadata.sha256))
  if(createHash('sha256').update(await readFile(path.join(app,name))).digest('hex')!==sha256) throw Error('Build source differs from packaged source');
const out = path.join(app, 'evidence/performance', 'latency-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out, {recursive:true});
const budgetFile = process.env.KINNSO_LATENCY_BUDGET_FILE;
const budgetBytes = budgetFile ? await readFile(budgetFile) : undefined;
const budget = budgetBytes ? JSON.parse(budgetBytes.toString()) : undefined;
let baselineReport;
if (budget && (budget.environment !== 'owned isolated local' || budget.project !== target.projectRef ||
    budget.sourceSha !== sourceSha || !budget.baselineSha256 || !budget.baselineFile)) throw Error('Budget must bind this source, target and retained baseline');
if (budget) {
  const baseline = await readFile(budget.baselineFile);
  if (createHash('sha256').update(baseline).digest('hex') !== budget.baselineSha256) throw Error('Baseline hash mismatch');
  const before = JSON.parse(baseline.toString());
  if (before.sourceSha !== sourceSha || before.assessment?.status !== 'MEASURED_BUDGET_NOT_SET') throw Error('A complete same-source unbudgeted baseline is required');
  validateLatencyBudget(budget,before,sourceSha,target.projectRef);
  baselineReport = before;
}
await new Promise((resolve,reject) => {
  const probe=createServer(); probe.once('error',reject);
  probe.listen(3523,'127.0.0.1',()=>probe.close(resolve));
});
const env = {...process.env, KINNSO_ENVIRONMENT:'local', KINNSO_SITE_URL:origin};
const log = createWriteStream(path.join(out,'server.log'));
const server = spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3523'],
  {cwd:app,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
server.stdout.pipe(log); server.stderr.pipe(log);
const report = {schemaVersion:1,kind:'latency',sourceSha,sourceDiff:execFileSync('git',['diff','--name-only'],{cwd:app,encoding:'utf8'}).trim().split('\n').filter(Boolean),
  environment:'owned isolated local',project:target.projectRef,observedAt:new Date().toISOString(),
  conditions:{region:'same Windows host, loopback app/PostgREST and owned Docker PostgreSQL',concurrency:1,
    warmupReads:3,measuredReads:40,node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,
    databaseImage:inspect.Config.Image,buildId:(await readFile(path.join(app,'.next/BUILD_ID'),'utf8')).trim(),
    sourceArchiveSha256:createHash('sha256').update(await readFile(archivePath)).digest('hex'),
    buildSourceVerified:true,
    databaseCache:'warm/shared; no cache flush, database restart, reset or ANALYZE mutation',
    postgresMethod:'EXPLAIN ANALYZE FORMAT JSON in READ ONLY/ROLLBACK with anon or authenticated role; function internals included in total, not expanded',
    apiMethod:'BFF fetch through consumed/verified JSON; includes auth and projection overhead',
    postgrestMethod:'Supabase SDK read through consumed/verified JSON; includes loopback transport'},
  dataset:null,samples:[],warmups:[],cleanup:'PENDING',
  budget:budget ? {limits:budget.limits,baselineSha256:budget.baselineSha256,fileSha256:createHash('sha256').update(budgetBytes).digest('hex'),role:'provisional local engineering regression budgets; not approved cloud SLOs'} : null,
  limitations:['Synthetic authored content, no covers; this is not production or physical-device evidence.',
    'Home and explore share the catalog projection; explore adds a city filter.',
    'EXPLAIN ANALYZE has instrumentation overhead and excludes network/result serialization.',
    'No load/concurrency, cold database, content-size distribution or cloud p95 is claimed.']};
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(target.apiOrigin,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const publicClient=createClient(target.apiOrigin,process.env.SUPABASE_ANON_KEY,options);
let ownerId, guideId, tripId, actor, claims;
const jar=new Map(), tag='Latency'+randomUUID().replaceAll('-','');
const checked=r=>{if(r.error)throw Error('Local fixture/read rejected: '+(r.error.code??'unknown'));return r.data;};
const sql=text=>execFileSync('docker',['exec','-i',target.dbContainer,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],
  {input:text,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const projection='id,slug,title,city,summary,cover_url,creator_handle,creator_name,published_at';
const catalog=filtered=>publicClient.from('guides').select(projection).eq('status','published')
  .order('published_at',{ascending:false,nullsFirst:false}).order('id').limit(13)
  .match(filtered?{city:tag}:{});
const catalogSQL=filtered=>`select ${projection} from public.guides where status='published' ${filtered?'and city='+literal(tag):''} order by published_at desc nulls last,id asc limit 13`;
function verify(operation, data, api=false) {
  if (operation==='home'||operation==='explore') {
    const rows=api?data.items:data;
    if (api&&data.status!=='ready'||!Array.isArray(rows)||rows.length!==(api?12:13)||rows.some(r=>r.city!==tag)) throw Error('Bounded catalog identity mismatch');
    if (api&&!data.hasMore) throw Error('Scale catalog lost its next page');
  } else {
    const row=api?data.data:data;
    if(api&&data.ok!==true||row?.id!==(operation==='guide'?guideId:tripId)) throw Error('Read identity mismatch');
    if(operation==='trip'&&(row.days?.length!==1||row.days[0].stops?.length!==1)) throw Error('Trip aggregate mismatch');
  }
}
async function timed(layer,operation,run,warmup,read) {
  const start=performance.now();
  const sample={layer,operation,run,status:'FAIL',verified:false};
  try {await read();sample.status='PASS';sample.verified=true;} finally {
    sample.durationMs=performance.now()-start;(warmup?report.warmups:report.samples).push(sample);
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
}
try {
  for(let i=0;i<60;i++) {
    if(server.exitCode!==null)throw Error('Owned app exited before readiness');
    try{if((await fetch(origin+'/api/catalog',{redirect:'error',signal:AbortSignal.timeout(1000)})).ok)break;}catch{}
    if(i===59)throw Error('Owned app readiness failed');await new Promise(r=>setTimeout(r,500));
  }
  const email='synthetic-latency-'+randomUUID()+'@example.test',password='Lab!'+randomUUID();
  ownerId=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
  checked(await admin.from('creators').update({status:'active',display_name:'Synthetic latency author'}).eq('id',ownerId));
  actor=createServerClient(target.apiOrigin,process.env.SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),
    setAll:values=>{for(const {name,value} of values)jar.set(name,value);}}});
  const session=checked(await actor.auth.signInWithPassword({email,password})).session;
  claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
  const rows=Array.from({length:2401},(_,i)=>({creator_id:ownerId,creator_name:'Synthetic latency author',creator_handle:'synthetic',
    slug:tag+'-'+i,title:'Synthetic latency guide '+i,summary:'Explicitly authored local scale data',cover_url:'',city:tag,
    status:'published',published_at:new Date(Date.UTC(2090,0,1,0,0,i)).toISOString()}));
  for(let i=0;i<rows.length;i+=200)checked(await actor.from('guides').insert(rows.slice(i,i+200)));
  guideId=checked(await actor.from('guides').select('id').eq('creator_id',ownerId).order('id').limit(1).single()).id;
  checked(await actor.rpc('publish_guide_version',{p_guide_id:guideId,p_expected_version:0,p_request_id:randomUUID(),
    p_content:{days:[{offset:0,title:'Authored latency day',stops:[{title:'Authored latency stop',description:'Public instruction',placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]}}));
  let trip=checked(await actor.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic latency trip',timezone:'UTC'}}));
  trip=checked(await actor.rpc('adopt_guide_to_trip',{p_guide_id:guideId,p_version:1,p_trip_id:trip.id,p_expected_revision:trip.revision,p_request_id:randomUUID()}));tripId=trip.id;
  const snapshot=checked(await actor.rpc('get_trip_snapshot',{p_trip_id:tripId}));verify('trip',snapshot);
  const count=Number(sql(`begin read only; select count(*) from public.guides where creator_id=${literal(ownerId)}::uuid; rollback;`).trim());
  const capped=checked(await publicClient.from('guides').select('id').eq('city',tag).limit(2401));
  report.dataset={guides:count,observedRowCap:capped.length,tripDays:1,tripStops:1,
    baselinePublishedGuides:Number(sql(`begin read only; select count(*) from public.guides where status='published' and creator_id<>${literal(ownerId)}::uuid; rollback;`).trim()),
    schemaHead:sql('begin read only; select max(version) from supabase_migrations.schema_migrations; rollback;').trim(),
    postgresVersion:sql('show server_version;').trim(),guideBody:'one explicitly authored day/stop, all other rows summary-only',owners:1};
  if(count!==2401||capped.length<=0||count<=capped.length*2)throw Error('Scale must exceed the observed PostgREST cap by more than two times');
  if(baselineReport && (JSON.stringify(baselineReport.conditions)!==JSON.stringify(report.conditions) ||
    JSON.stringify(baselineReport.dataset)!==JSON.stringify(report.dataset))) throw Error('Budget comparison requires unchanged measured conditions and dataset');
  const cookie=[...jar].map(([name,value])=>name+'='+value).join('; ');
  for(const layer of ['api','postgrest']) for(const operation of pages) for(let i=1;i<=43;i++) {
    await timed(layer,operation,i<=3?i:i-3,i<=3,async()=>{
      if(layer==='postgrest') {
        const data=checked(await (operation==='home'||operation==='explore'?catalog(operation==='explore'):
          operation==='guide'?publicClient.rpc('kinnso_guide',{p_guide_id:guideId}):actor.rpc('get_trip_snapshot',{p_trip_id:tripId})));
        verify(operation,data);
      } else {
        const route=operation==='home'?'/api/catalog':operation==='explore'?'/api/catalog?city='+tag:
          operation==='guide'?'/api/guides/'+guideId:'/api/trips/'+tripId;
        const response=await fetch(origin+route,{headers:operation==='trip'?{cookie}:{},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
        const data=await response.json();if(!response.ok)throw Error('BFF '+operation+' returned '+response.status);verify(operation,data,true);
      }
    });
  }
  for(const operation of pages) {
    const statement=operation==='home'||operation==='explore'?catalogSQL(operation==='explore'):
      operation==='guide'?`select public.kinnso_guide(${literal(guideId)}::uuid)`:`select public.get_trip_snapshot(${literal(tripId)}::uuid)`;
    const role=operation==='trip'?'authenticated':'anon';
    const jwt=operation==='trip'?JSON.stringify(claims):JSON.stringify({role:'anon'});
    let input=`begin read only; set local statement_timeout='8s'; set local role ${role}; set local "request.jwt.claims"=${literal(jwt)};\n`;
    for(let i=1;i<=43;i++)input+=`\\echo SAMPLE_${i}\nexplain (analyze, buffers, format json) ${statement};\n`;
    input+='rollback;';
    const result=sql(input);
    const chunks=result.split(/SAMPLE_(\d+)\r?\n/).slice(1);
    if(chunks.length!==86)throw Error('Missing PostgreSQL measurements');
    for(let i=0;i<chunks.length;i+=2) {
      const n=Number(chunks[i]),plan=JSON.parse(chunks[i+1].trim())[0];
      const sample={layer:'postgres',operation,run:n<=3?n:n-3,status:'PASS',verified:plan.Plan['Actual Rows']===(operation==='home'||operation==='explore'?13:1),durationMs:plan['Execution Time'],planningMs:plan['Planning Time']};
      (n<=3?report.warmups:report.samples).push(sample);
      // Never retain claims, SQL values, private aggregate bodies or owner IDs.
      const redacted=JSON.stringify(plan).replaceAll(ownerId,'OWNED_ACTOR').replaceAll(guideId,'OWNED_GUIDE').replaceAll(tripId,'OWNED_TRIP').replaceAll(tag,'OWNED_CITY');
      await writeFile(path.join(out,`postgres-${operation}-${n}.json`),redacted);
    }
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
} catch(error) {
  report.error=error instanceof Error?error.message:'Collection failed';process.exitCode=1;
} finally {
  const errors=[];
  if(ownerId) {
    try {checked(await admin.auth.admin.deleteUser(ownerId));
      const remaining=Number(sql(`begin read only; select (select count(*) from auth.users where id=${literal(ownerId)}::uuid)+(select count(*) from public.guides where creator_id=${literal(ownerId)}::uuid)+(select count(*) from public.trips where owner_user_id=${literal(ownerId)}::uuid); rollback;`).trim());
      if(remaining!==0)throw Error('Owned records remain');
    } catch(error) {errors.push(error.message);}
  }
  report.cleanup=errors.length?{status:'FAIL',errors}:'PASS_OWNED_SYNTHETIC_ACTORS_REMOVED';
  // Stop the owned process before assessment/persistence can throw.
  if(server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
  log.end();
  report.assessment=assessLatency(report,budget?.limits);
  if(report.assessment.status==='FAIL'||report.assessment.status==='INCOMPLETE')process.exitCode=1;
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({report:path.join(out,'report.json'),status:report.assessment.status,samples:report.samples.length,cleanup:report.cleanup,error:report.error}));
}
