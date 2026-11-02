import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Blocked,gate,requireVerifiedTarget,targetIdentityHash} from './target.mjs';
import {createReplayPlan} from './live-support.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
function sanitizeSqlState(error){return /^[0-9A-Z]{5}$/.test(error?.sqlState??'')?error.sqlState:'UNKNOWN';}
function sqlLiteral(value){return `'${String(value).replaceAll("'", "''")}'`;}
export async function applyMigrationBytes(target,file,bytes,runner,verifyTarget=requireVerifiedTarget,appendJournal=false){
  verifyTarget(target,'migrate');
  gate(sha256(bytes)===file.sha256,'MIGRATION_DRIFT');
  const journal=appendJournal?`\ninsert into kinnso_na_control.migration_journal(version,name,sha256) values(${sqlLiteral(file.version)},${sqlLiteral(file.name)},${sqlLiteral(file.sha256)});\n`: '';
  const input=Buffer.concat([Buffer.from('\\set ON_ERROR_STOP on\n\\set VERBOSITY verbose\n'),bytes,Buffer.from(journal)]);
  const args=['exec','-i','--env','PGOPTIONS=-c statement_timeout=30000 -c lock_timeout=5000',target.dbContainerId,'psql','-X','-q','-v','ON_ERROR_STOP=1','--no-password','--username=postgres','--dbname=postgres','--single-transaction','--file=-'];
  try{await runner.run(args,{input});return Object.freeze({name:file.name,version:file.version,sha256:file.sha256,status:'APPLIED'});}
  catch(error){const blocked=new Blocked('MIGRATION_FAILED');blocked.sqlState=sanitizeSqlState(error);blocked.migrationVersion=file.version;throw blocked;}
}

export async function migrateAgainstTarget(plan,{manifest=plan.manifest,readMigrationFile,run,collectCatalog,journal,verifyTarget=requireVerifiedTarget}){
  gate(journal&&typeof journal.initialize==='function'&&typeof journal.read==='function','MIGRATION_JOURNAL_ADAPTER_REQUIRED');
  verifyTarget(plan,'migrate');
  await journal.initialize();
  const files=createReplayPlan(manifest),existing=await journal.read(),applied=[];
  if(existing.length>files.length||existing.some((row,index)=>row.version!==files[index].version||row.name!==files[index].name||row.sha256!==files[index].sha256))
    throw new Blocked('MIGRATION_JOURNAL_MISMATCH');
  for(const file of files.slice(existing.length)){
    const bytes=await readMigrationFile(file);
    gate(Buffer.isBuffer(bytes)&&sha256(bytes)===file.sha256,'MIGRATION_DRIFT');
    applied.push(await applyMigrationBytes(plan,file,bytes,{run},verifyTarget,true));
  }
  const serverJournal=await journal.read();
  if(serverJournal.length!==files.length||serverJournal.some((row,index)=>row.version!==files[index].version||row.name!==files[index].name||row.sha256!==files[index].sha256))
    throw new Blocked('MIGRATION_JOURNAL_MISMATCH');
  const catalog=await collectCatalog();
  validateCatalog(catalog);
  return Object.freeze({status:'SCHEMA_READY',runId:plan.runId,sourceHash:plan.sourceHash,migrationHash:manifest.hash,
    targetHash:targetIdentityHash(plan),
    schemaHash:sha256(JSON.stringify({catalog,journal:serverJournal})),journal:applied,serverJournal,postgresVersion:catalog.postgresVersion});
}

export function createAcceptanceJournal(target,runner,verifyTarget=requireVerifiedTarget,verifyStage='migrate'){
  const execute=async sql=>{
    verifyTarget(target,verifyStage);
    return runner.run(['exec','-i','--env','PGOPTIONS=-c statement_timeout=10000 -c lock_timeout=3000',target.dbContainerId,
      'psql','-X','-q','-t','-A','--no-password','--username=postgres','--dbname=postgres','--set=ON_ERROR_STOP=1','--file=-'],{input:sql});
  };
  return {
    async initialize(){
      await execute(`create schema if not exists kinnso_na_control;
create table if not exists kinnso_na_control.migration_journal(
  version text primary key check(version ~ '^[0-9]{14}$'),
  name text not null unique,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz not null default clock_timestamp()
);
revoke all on schema kinnso_na_control from public,anon,authenticated,service_role;
revoke all on kinnso_na_control.migration_journal from public,anon,authenticated,service_role;`);
    },
    async read(){
      const result=await execute(`select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'sha256',sha256) order by version),'[]'::jsonb) from kinnso_na_control.migration_journal;`);
      try{return JSON.parse(result.stdout.trim());}catch{throw new Blocked('MIGRATION_JOURNAL_INVALID');}
    }
  };
}

export function validateCatalog(catalog){
  gate(/^17\./.test(catalog?.postgresVersion??''),'POSTGRES_VERSION_MISMATCH');
  gate(Array.isArray(catalog.discoveryGates)&&catalog.discoveryGates.length===1&&catalog.discoveryGates[0].privateWrites===false&&catalog.discoveryGates[0].licensedWrites===false,'DISCOVERY_GATES_NOT_CLOSED');
  gate(catalog.authorityKeyCount===0&&catalog.rightsApprovalCount===0,'FIXTURE_REGISTRIES_NOT_EMPTY');
  const hasTable=(schema,name)=>catalog.tables?.some(row=>row.schema===schema&&row.name===name);
  gate(hasTable('public','trip_intents')&&hasTable('public','studio_threads')&&hasTable('kinnso_internal','discovery_gate'),'SCHEMA_OBJECT_MISSING');
  const hasFunction=(schema,name,args)=>catalog.functions?.some(row=>row.schema===schema&&row.name===name&&row.args===args);
  gate(hasFunction('public','apply_kinnso_discovery_command','uuid, integer, uuid, jsonb')&&
    hasFunction('public','apply_kinnso_discovery_command','uuid, integer, uuid, jsonb, jsonb'),'RPC_CONTRACT_MISSING');
}

export function createCatalogCollector(target,runner={run:async()=>{throw new Blocked('CATALOG_COLLECTOR_NOT_IMPLEMENTED');}},verifyTarget=requireVerifiedTarget,verifyStage='migrate'){
  return async()=>{
    verifyTarget(target,verifyStage);
    const sql=await readFile(new URL('./sql/catalog.sql',import.meta.url),'utf8');
    const result=await runner.run(['exec','-i','--env','PGOPTIONS=-c statement_timeout=10000 -c lock_timeout=3000',target.dbContainerId,
      'psql','-X','-q','-t','-A','--no-password','--username=postgres','--dbname=postgres','--set=ON_ERROR_STOP=1','--file=-'],{input:sql});
    try{return JSON.parse(result.stdout.trim());}catch{throw new Blocked('CATALOG_RESPONSE_INVALID');}
  };
}

export async function verifySchemaReceipt(target,schema,{journal,collectCatalog,verifyTarget=requireVerifiedTarget}){
  verifyTarget(target,'run');
  gate(journal&&typeof journal.read==='function'&&typeof collectCatalog==='function'&&schema?.targetHash===targetIdentityHash(target),'SCHEMA_RECEIPT_REQUIRED');
  const serverJournal=await journal.read(),catalog=await collectCatalog();validateCatalog(catalog);
  const schemaHash=sha256(JSON.stringify({catalog,journal:serverJournal}));
  gate(schema.schemaHash===schemaHash&&JSON.stringify(schema.serverJournal)===JSON.stringify(serverJournal),'LIVE_SCHEMA_DRIFT');
  return {status:'LIVE_SCHEMA_VERIFIED',schemaHash,catalogHash:sha256(JSON.stringify(catalog)),journalCount:serverJournal.length};
}
