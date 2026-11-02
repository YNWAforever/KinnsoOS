// Explicit stages, no dotenv or SDK imports at module load time.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Blocked,attestTarget,targetIdentityHash} from '../tests/native-db/target.mjs';
import {buildMigrationManifest} from '../tests/native-db/migrations.mjs';
import {sourceManifest,collectPreflight} from '../tests/native-db/inventory.mjs';
import {createStageStore} from '../tests/native-db/stage-state.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const stages=['plan','preflight','provision','migrate','run','cleanup-owned'];
const stageAdapters={
  preflight:['load','preflight'],
  provision:['load','preflight','provision','attestTopology','store'],
  migrate:['load','readState','attestTopology','replay','store'],
  run:['load','readState','attestTopology','verifySchema','runCases'],
  'cleanup-owned':['load','readState','attestTopology','cleanupOwned','store']
};
function assertSameTarget(saved,fresh){
  if(!saved||saved.runId!==fresh.runId||saved.dbContainerId!==fresh.dbContainerId||saved.networkId!==fresh.networkId||
    saved.volumeId!==fresh.volumeId||saved.sourceHash!==fresh.sourceHash||saved.migrationHash!==fresh.migrationHash||
    JSON.stringify(saved.containerIds)!==JSON.stringify(fresh.containerIds)||
    JSON.stringify(saved.imageDigests)!==JSON.stringify(fresh.imageDigests))
    throw new Blocked('TARGET_CONTINUITY_MISMATCH');
}

export function parseArguments(args){
  let stage,manifest;
  for(let n=0;n<args.length;n++){
    if(args[n]==='--manifest'){
      if(manifest||typeof args[n+1]!=='string'||args[n+1].startsWith('--'))throw Error('ARGUMENT_INVALID');
      manifest=args[++n];
    }else{
      if(!args[n].startsWith('--')||!stages.includes(args[n].slice(2))||stage)throw Error('ARGUMENT_INVALID');
      stage=args[n].slice(2);
    }
  }
  if(!stage||(stage==='plan'&&manifest)||(stage!=='plan'&&!manifest))throw Error('ARGUMENT_INVALID');
  return manifest?{stage,manifest}:{stage};
}

const privateState=createStageStore(root);
const defaults={
  async plan(){
    const [migrations,source,stack,cases]=await Promise.all([
      buildMigrationManifest(root),
      sourceManifest(root),
      readFile(new URL('../tests/native-db/stack.config.json',import.meta.url),'utf8'),
      readFile(new URL('../tests/native-db/cases.json',import.meta.url),'utf8')
    ]);
    const catalog=JSON.parse(cases);
    return {status:'PLAN_ONLY',mutations:0,stack:JSON.parse(stack),sourceHash:source.hash,sourceFiles:source.files.length,
      migrationHash:migrations.hash,migrationFiles:migrations.files.length,
      implementation:{offlineGuards:true,liveProvisioner:true,liveTopologyAttestor:true,liveReplay:true,
        authFixtures:true,nativeCaseHandlers:catalog.cases.filter(item=>item.implemented).length,catalogExpanded:catalog.expanded===true}};
  },
  async load(file){return JSON.parse(await readFile(path.resolve(file),'utf8'));},
  async preflight(plan){
    let observation;
    try{
      return await attestTarget(plan,'preflight',{probe:async()=>{
        observation=await collectPreflight(root,plan);
        return observation;
      }});
    }catch(error){
      if(observation)error.observation=observation;
      throw error;
    }
  },
  readState:privateState.read,
  store:privateState.write,
  async provision(plan,preflight){
    const {provisionIsolatedStack}=await import('../tests/native-db/provisioner.mjs');
    return provisionIsolatedStack(root,plan,preflight);
  },
  async attestTopology(plan,stage){
    const {attestTopologyForPlan}=await import('../tests/native-db/live-runtime.mjs');
    return attestTopologyForPlan(plan,stage);
  },
  async replay(plan,target){
    const [{buildMigrationManifest},{createCatalogCollector,createAcceptanceJournal,migrateAgainstTarget},{run,engineHost}]=await Promise.all([
      import('../tests/native-db/migrations.mjs'),import('../tests/native-db/database.mjs'),import('../tests/native-db/docker-runtime.mjs')
    ]);
    const manifest=await buildMigrationManifest(root),source=await sourceManifest(root);
    if(manifest.hash!==plan.migrationHash||source.hash!==plan.sourceHash)throw new Blocked('SOURCE_DRIFT');
    const runner={run:(args,options)=>run('docker',['--host',engineHost,...args],options)};
    return migrateAgainstTarget(target,{
      manifest,
      readMigrationFile:file=>readFile(path.join(root,'supabase/migrations',file.name)),
      run:runner.run,
      collectCatalog:createCatalogCollector(target,runner),
      journal:createAcceptanceJournal(target,runner)
    });
  },
  async runCases({plan,topology,schema}){
    const {runNativeCaseProgram}=await import('../tests/native-db/live-runtime.mjs');
    return runNativeCaseProgram({plan,target:topology,schema});
  },
  async verifySchema(plan,target,schema){
    const [{createAcceptanceJournal,createCatalogCollector,verifySchemaReceipt},{run,engineHost}]=await Promise.all([
      import('../tests/native-db/database.mjs'),import('../tests/native-db/docker-runtime.mjs')
    ]);
    const source=await sourceManifest(root);if(source.hash!==plan.sourceHash)throw new Blocked('SOURCE_DRIFT');
    const runner={run:(args,options)=>run('docker',['--host',engineHost,...args],options)};
    return verifySchemaReceipt(target,schema,{
      journal:createAcceptanceJournal(target,runner,undefined,'run'),
      collectCatalog:createCatalogCollector(target,runner,undefined,'run')
    });
  },
  async cleanupOwned(plan,target){
    const {ownedCleanup}=await import('../tests/native-db/live-runtime.mjs');
    return ownedCleanup(plan,target);
  }
};

export async function executeStage(options,ports=defaults){
  const stage=options?.stage;
  let sideEffectsStarted=false;
  try{
    if(stage==='plan')return await ports.plan();
    const required=stageAdapters[stage];
    if(!required)throw new Blocked('ARGUMENT_INVALID');
    if(required.some(name=>typeof ports[name]!=='function'))throw new Blocked(`${stage.toUpperCase().replaceAll('-','_')}_ADAPTER_INVALID`);
    const plan=await ports.load(options.manifest);
    if(stage==='preflight')return await ports.preflight(plan);
    if(stage==='provision'){
      const preflight=await ports.preflight(plan);sideEffectsStarted=true;
      const provisioned=await ports.provision(plan,preflight);
      const topology=await ports.attestTopology(plan,stage,provisioned);
      await ports.store(plan,{preflight,provision:{...provisioned,topology},topology});
      return {status:'PROVISION_READY',runId:plan.runId,topology,mutations:'RESOURCES_CREATED'};
    }
    const state=await ports.readState(plan),saved=state.provision?.topology;
    if(!saved)throw new Blocked('PROVISION_RECEIPT_REQUIRED');
    if(stage==='migrate'){
      const topology=await ports.attestTopology(plan,stage);
      assertSameTarget(saved,topology);sideEffectsStarted=true;
      const schema=await ports.replay(plan,topology);
      await ports.store(plan,{topology,schema});
      return {status:'SCHEMA_READY',runId:plan.runId,schema,mutations:'WRITES_COMMITTED_OR_UNKNOWN'};
    }
    if(stage==='run'){
      const topology=await ports.attestTopology(plan,stage);
      assertSameTarget(saved,topology);sideEffectsStarted=true;
      const schema=state.schema;
      if(!schema||schema.runId!==plan.runId||schema.sourceHash!==plan.sourceHash||schema.migrationHash!==plan.migrationHash||
        schema.targetHash!==targetIdentityHash(topology)||
        !/^[a-f0-9]{64}$/.test(schema.schemaHash??''))throw new Blocked('SCHEMA_RECEIPT_REQUIRED');
      await ports.verifySchema(plan,topology,schema);
      const result=await ports.runCases({plan,topology,schema}),summaryStatus=result?.summary?.status;
      if(summaryStatus==='LOCAL_NATIVE_DB_ACCEPTANCE_PASS')return {...result,status:'PASS'};
      return {...result,status:summaryStatus==='FAIL'?'FAIL':'BLOCKED',code:summaryStatus??'NATIVE_RESULT_UNKNOWN'};
    }
    if(stage==='cleanup-owned'){
      const topology=await ports.attestTopology(plan,stage);
      assertSameTarget(saved,topology);sideEffectsStarted=true;
      const cleanup=await ports.cleanupOwned(plan,topology);
      await ports.store(plan,{cleanup});
      return {status:'OWNED_CLEANUP_COMPLETE',runId:plan.runId,cleanup,mutations:'OWNED_RESOURCES_REMOVED'};
    }
    throw new Blocked('ARGUMENT_INVALID');
  }catch(error){
    return {status:'BLOCKED',code:/^[A-Z0-9_:]{1,100}$/.test(error.code??'')?error.code:'LOCAL_OPERATION_FAILED',
      mutations:sideEffectsStarted?'UNKNOWN':0,...(error.sqlState?{sqlState:error.sqlState}:{}),...(error.observation?{observation:error.observation}:{})};
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let result;
  try{result=await executeStage(parseArguments(process.argv.slice(2)));}catch(error){
    result={status:'BLOCKED',code:error instanceof Blocked?error.code:'ARGUMENT_INVALID',mutations:'UNKNOWN_OR_NOT_STARTED'};
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.status==='BLOCKED')process.exitCode=78;else if(result.status==='FAIL'||result.status==='INCOMPLETE'||result.status==='INVALID_EVIDENCE')process.exitCode=1;
}
