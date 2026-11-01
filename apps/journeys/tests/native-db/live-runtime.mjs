import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {cliEnvironment} from './inventory.mjs';
import {run,docker,engineHost,attestLiveTopology} from './docker-runtime.mjs';
import {createAuthFixtures} from './auth-fixtures.mjs';
import {createSupabaseFixtureAdapter,parseSupabaseStatus,sqlLiteral} from './live-auth.mjs';
import {buildNativeHandlers} from './native-live-cases.mjs';
import {runNativeCases} from './native-suite.mjs';
import {gate} from './target.mjs';
import {repositoryRoot,resolveCachedCli} from './workspace.mjs';
import {requireVerifiedTarget} from './target.mjs';
import {createWorkerPool} from './worker-pool.mjs';
import {sourceManifest} from './inventory.mjs';
import {privateIntentFaultSql,removePrivateIntentFaultSql,privateFaultName} from './private-rollback.mjs';
import {assertCleanupIdentity} from './cleanup.mjs';

const root=repositoryRoot;
async function locateCli(){
  return resolveCachedCli(root);
}
async function localStatus(configDir,apiOrigin){
  const cli=await locateCli();
  const result=await run(process.execPath,[cli,'status','--workdir',configDir,'--output','json'],{env:cliEnvironment(process.env),timeout:30000});
  return parseSupabaseStatus(result.stdout,apiOrigin);
}
export async function createLiveCaseContext(plan,target){
  requireVerifiedTarget(target,'run');
  gate(target.runId===plan.runId&&target.sourceHash===plan.sourceHash,'TARGET_CONTINUITY_MISMATCH');
  gate((await sourceManifest(root)).hash===plan.sourceHash,'SOURCE_DRIFT');
  const runDir=path.join(root,'.local-private/native-acceptance',plan.runId),configDir=path.join(runDir,'supabase');
  const credentials=await localStatus(configDir,plan.apiOrigin);
  const require=createRequire(path.join(root,'apps/journeys/package.json'));
  const {createClient}=await import(pathToFileURL(require.resolve('@supabase/supabase-js')).href);
  const admin=createClient(credentials.apiUrl,credentials.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  async function sql(text){
    const result=await run('docker',['--host',engineHost,'exec','-i','--env','PGOPTIONS=-c statement_timeout=15000 -c lock_timeout=5000',
      target.dbContainerId,'psql','-X','-q','-t','-A','--no-password','--username=postgres','--dbname=postgres','--set=ON_ERROR_STOP=1','--file=-'],{input:text});
    return result.stdout.trim();
  }
  const adapter=createSupabaseFixtureAdapter({admin,sql,createClient,apiUrl:credentials.apiUrl,anonKey:credentials.ANON_KEY});
  let fixture,workerPool=null;
  const refresh=async()=>{
    const fresh=await attestLiveTopology(plan,'run');
    gate(['runId','dbContainerId','networkId','volumeId','sourceHash','migrationHash'].every(k=>fresh[k]===target[k])&&
      JSON.stringify(fresh.imageDigests)===JSON.stringify(target.imageDigests),'TARGET_CONTINUITY_MISMATCH');
    return fresh;
  };
  try{
   fixture=await createAuthFixtures({admin:adapter,runId:plan.runId});
   const anonymous=createClient(credentials.apiUrl,credentials.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   return {
    plan,target,actors:fixture.actors,companies:fixture.companies,branches:fixture.branches,fixture,anonymous,
    async workers(){
      if(!workerPool)workerPool=await createWorkerPool({plan,target:await refresh(),admin:sql,refresh});
      return workerPool;
    },
    async cleanupWorkers(){if(workerPool)await workerPool.cleanup();},
    tables:['trip_intents','discovery_preferences','merchant_links','offer_imports','offer_publications','match_runs','match_choices','studio_threads','studio_sources'],
    async setGates(privateWrites,licensedWrites){
      if(typeof privateWrites!=='boolean'||typeof licensedWrites!=='boolean')throw Object.assign(Error('gate'),{code:'GATE_INPUT_INVALID'});
      await sql(`update kinnso_internal.discovery_gate set private_writes=${privateWrites},licensed_writes=${licensedWrites} where singleton;`);
      const row=JSON.parse(await sql(`select jsonb_build_object('privateWrites',private_writes,'licensedWrites',licensed_writes) from kinnso_internal.discovery_gate where singleton;`));
      if(row.privateWrites!==privateWrites||row.licensedWrites!==licensedWrites)throw Object.assign(Error('gate'),{code:'GATE_UPDATE_FAILED'});
    },
    async getPreferenceRevision(actorId){
      const raw=await sql(`select coalesce((select revision from public.discovery_preferences where owner_actor_id=${sqlLiteral(actorId)}::uuid),0);`);
      const value=Number(raw);if(!Number.isSafeInteger(value))throw Object.assign(Error('revision'),{code:'PREFERENCE_REVISION_INVALID'});return value;
    },
    async observePrivateCommand(command,targetId){
      if(command==='savePreferences'||command==='clearPreferences')return {revision:await this.getPreferenceRevision(targetId)};
      const raw=await sql(`select coalesce((select jsonb_build_object('revision',revision,'status',status) from public.trip_intents where id=${sqlLiteral(targetId)}::uuid),'null'::jsonb);`);
      return JSON.parse(raw);
    },
    async observeUuidEffects(actorId,input){
      return JSON.parse(await sql(`SELECT jsonb_build_object(
 'intentCount',(SELECT count(*) FROM public.trip_intents WHERE id=${sqlLiteral(input.p_target_id)}::uuid AND owner_actor_id=${sqlLiteral(actorId)}::uuid),
 'receiptCount',(SELECT count(*) FROM kinnso_internal.discovery_requests WHERE actor_id=${sqlLiteral(actorId)}::uuid AND request_id=${sqlLiteral(input.p_request_id)}::uuid),
 'intentRevision',(SELECT revision FROM public.trip_intents WHERE id=${sqlLiteral(input.p_target_id)}::uuid AND owner_actor_id=${sqlLiteral(actorId)}::uuid),
 'receiptRevision',(SELECT revision FROM kinnso_internal.discovery_requests WHERE actor_id=${sqlLiteral(actorId)}::uuid AND request_id=${sqlLiteral(input.p_request_id)}::uuid));`));
    },
    async installPrivateFault(spec){await sql(privateIntentFaultSql(spec));},
    async removePrivateFault(spec){
      await sql(removePrivateIntentFaultSql(spec));
      const name=privateFaultName(spec.caseId);
      const remaining=await sql(`SELECT (SELECT count(*) FROM pg_trigger WHERE tgname=${sqlLiteral(name+'_trigger')})+
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='kinnso_na_fault' AND p.proname=${sqlLiteral(name+'_fail')});`);
      gate(Number(remaining)===0,'FAULT_CLEANUP_FAILED');
    },
    async resetGates(){await sql(`update kinnso_internal.discovery_gate set private_writes=false,licensed_writes=false where singleton;`);}
   };
  }catch(error){
   if(fixture)await fixture.cleanup().catch(()=>{});
   throw error;
  }
}
export async function runNativeCaseProgram({plan,target,schema}){
  let context,setupError;
  try{context=await createLiveCaseContext(plan,target);}
  catch(error){setupError=error;}
  if(setupError){
    if(setupError.fixtureCleanup)await retryFixtureCleanup(setupError.fixtureCleanup);
    throw Object.assign(Error('setup'),{code:setupError.code??'NATIVE_FIXTURE_SETUP_FAILED'});
  }
  const cleanupContext=async()=>{
    const cleanup=[await context.cleanupWorkers().then(()=>({status:'fulfilled'}),()=>({status:'rejected'}))];
    cleanup.push(...await Promise.allSettled([context.resetGates(),context.fixture.cleanup()]));
    if(cleanup.some(item=>item.status==='rejected'))throw Object.assign(Error('cleanup'),{code:'NATIVE_FIXTURE_CLEANUP_FAILED'});
  };
  try{
    const manifest=JSON.parse(await readFile(new URL('./cases.json',import.meta.url),'utf8'));
    const handlers=buildNativeHandlers(context);
    const evidenceDir=path.join(root,'.local-private/native-acceptance',plan.runId,'evidence');
    await mkdir(evidenceDir,{recursive:true,mode:0o700});
    return await runNativeCases({manifest,context:{runId:plan.runId,sourceHash:plan.sourceHash,targetReceiptHash:schema.targetHash,
      schemaReceiptHash:schema.schemaHash,cleanupStatus:'NOT_RUN'},handlers,evidenceWriter:async evidence=>{
        const name=evidence.id.replace(/[^a-z0-9_.-]/gi,'_')+'.json';
        await writeFile(path.join(evidenceDir,name),JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
        return path.join('evidence',name);
      },cleanup:cleanupContext});
  }catch(error){
    await cleanupContext().catch(()=>{});
    throw error;
  }
}
export async function retryFixtureCleanup(cleanup,{attempts=3}={}){
  if(typeof cleanup!=='function')return true;
  for(let attempt=0;attempt<attempts;attempt++)try{await cleanup();return true;}catch{}
  throw Object.assign(Error('fixture cleanup'),{code:'NATIVE_FIXTURE_CLEANUP_FAILED'});
}
export async function attestTopologyForPlan(plan,stage){return attestLiveTopology(plan,stage);}
export async function ownedCleanup(plan,target){
  const project=plan.project;
  const fresh=await attestLiveTopology(plan,'cleanup-owned');
  assertCleanupIdentity(target,fresh);
  const expectedVolume=target.volumeId,expectedNetwork=target.networkId,expectedContainers=[...target.containerIds];
  const inspectResources=async()=>{
    const [network,volume,containers]=await Promise.all([
      docker(['network','inspect',expectedNetwork]).then(JSON.parse).then(rows=>rows[0]),
      docker(['volume','inspect',expectedVolume]).then(JSON.parse).then(rows=>rows[0]),
      docker(['inspect',...expectedContainers]).then(JSON.parse)
    ]);
    if(network?.Id!==expectedNetwork||volume?.Name!==expectedVolume)throw Object.assign(Error('changed'),{code:'CLEANUP_TARGET_CHANGED'});
    if(volume.Labels?.['com.supabase.cli.project']!==project&&volume.Labels?.['org.kinnso.na.project']!==project)throw Object.assign(Error('owner'),{code:'OWNED_RESOURCE_MISMATCH'});
    if(network.Labels?.['org.kinnso.na.project']!==project||network.Labels?.['org.kinnso.na.run']!==plan.runId)throw Object.assign(Error('owner'),{code:'OWNED_RESOURCE_MISMATCH'});
    if(containers.length!==4||containers.some(row=>!expectedContainers.includes(row.Id)||row.Config?.Labels?.['com.supabase.cli.project']!==project))
      throw Object.assign(Error('changed'),{code:'CLEANUP_TARGET_CHANGED'});
    return {network,volume,containers};
  };
  await inspectResources();
  for(const id of [...expectedContainers].reverse()){
    const [row]=JSON.parse(await docker(['inspect',id]));
    if(row?.Id!==id||row.Config?.Labels?.['com.supabase.cli.project']!==project)throw Object.assign(Error('changed'),{code:'CLEANUP_TARGET_CHANGED'});
    await docker(['stop','--time','30',id]);
  }
  await inspectResources();
  for(const id of [...expectedContainers].reverse())await docker(['rm',id]);
  const remainingContainers=await docker(['ps','-a','--filter',`label=com.supabase.cli.project=${project}`,'--format','{{.ID}} {{.Names}}']);
  if(remainingContainers)throw Object.assign(Error('cleanup'),{code:'OWNED_CLEANUP_INCOMPLETE'});
  await inspectResources().catch(()=>{});
  const [networkNow,volumeNow]=await Promise.all([
    docker(['network','inspect',expectedNetwork]).then(JSON.parse).then(rows=>rows[0]),
    docker(['volume','inspect',expectedVolume]).then(JSON.parse).then(rows=>rows[0])
  ]);
  if(networkNow?.Id!==expectedNetwork||volumeNow?.Name!==expectedVolume)throw Object.assign(Error('changed'),{code:'CLEANUP_TARGET_CHANGED'});
  await docker(['volume','rm',expectedVolume]);
  await docker(['network','rm',expectedNetwork]);
  const [remainingVolume,remainingNetwork]=await Promise.all([
    docker(['volume','ls','--filter',`name=${expectedVolume}`,'--format','{{.Name}}']),
    docker(['network','ls','--filter',`name=${expectedNetwork}`,'--format','{{.Name}}'])
  ]);
  if(remainingVolume||remainingNetwork)throw Object.assign(Error('cleanup'),{code:'OWNED_CLEANUP_INCOMPLETE'});
  return {status:'PASS',containers:4,volume:1,network:1};
}
