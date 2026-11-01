import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyMigrationBytes,migrateAgainstTarget,validateCatalog,verifySchemaReceipt} from './database.mjs';
import {targetIdentityHash} from './target.mjs';

const target={runId:'8bce2805-c3e8-44f5-831e-805be1727c96',dbContainerId:'db1',networkId:'net1',volumeId:'vol1',
  sourceHash:'a'.repeat(64),migrationHash:'b'.repeat(64)};
test('psql replay runs only through the attested DB container with fail-fast settings',async()=>{
  const sql=Buffer.from('select 1;'),file={name:'20260101000000_a.sql',sha256:createHash('sha256').update(sql).digest('hex')};
  const calls=[];const result=await applyMigrationBytes(target,file,sql,{
    async run(args,options){calls.push({args,options});return {stdout:'',stderr:''};}},()=>{});
  assert.equal(result.status,'APPLIED');
  assert.equal(calls.length,1);
  assert(calls[0].args.includes('db1'));
  assert.match(calls[0].args.join(' '),/ON_ERROR_STOP/);
  assert.match(calls[0].args.join(' '),/statement_timeout/);
  assert.match(calls[0].options.input.toString(),/select 1/);
  assert.doesNotMatch(calls[0].options.input.toString(),/migration_journal/);
});

test('first migration error stops later files and does not leak SQL or credentials',async()=>{
  const calls=[];
  const first=Buffer.from('20260101000000_a.sql'),second=Buffer.from('20260101000001_b.sql');
  await assert.rejects(migrateAgainstTarget({...target,manifest:{hash:'b'.repeat(64),files:[
    {name:'20260101000000_a.sql',version:'20260101000000',sha256:createHash('sha256').update(first).digest('hex'),bytes:first.length},
    {name:'20260101000001_b.sql',version:'20260101000001',sha256:createHash('sha256').update(second).digest('hex'),bytes:second.length}
  ]}},{
    async readMigrationFile(file){return Buffer.from(file.name);},
    async run(args,options){calls.push(fileVersion(options.input.toString()));if(calls.length===1){const e=Error('secret password');e.sqlState='42P01';throw e;}return {stdout:'',stderr:''};},
    async collectCatalog(){throw Error('must not read catalog after failure');},verifyTarget:()=>{},
    journal:{initialize:async()=>{},read:async()=>[]}
  }),error=>error.code==='MIGRATION_FAILED'&&error.sqlState==='42P01'&&!JSON.stringify(error).includes('secret'));
  assert.deepEqual(calls,['20260101000000']);
  function fileVersion(text){return text.match(/(2026\d{10})_/)[1].slice(0,14);}
});

test('catalog validation requires PG17, closed gates, empty registries and generated schema objects',()=>{
  const good={postgresVersion:'17.6',discoveryGates:[{privateWrites:false,licensedWrites:false}],authorityKeyCount:0,rightsApprovalCount:0,
    tables:[{schema:'public',name:'trip_intents'},{schema:'public',name:'studio_threads'},{schema:'kinnso_internal',name:'discovery_gate'}],
    functions:[{schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb'},
      {schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb, jsonb'}]};
  assert.doesNotThrow(()=>validateCatalog(good));
  for(const mutate of [x=>x.postgresVersion='16.9',x=>x.discoveryGates=[],x=>x.discoveryGates[0].privateWrites=true,x=>x.authorityKeyCount=1,
    x=>x.tables=[],x=>x.functions=[]])assert.throws(()=>{const copy=structuredClone(good);mutate(copy);validateCatalog(copy);});
});

test('migration receipt binds run, source, SQL manifest, target and catalog fingerprint',async()=>{
  const sql=Buffer.from('select 1;'),hash=createHash('sha256').update(sql).digest('hex');
  const result=await migrateAgainstTarget({...target,manifest:{hash:'b'.repeat(64),files:[{name:'20260101000000_a.sql',version:'20260101000000',sha256:hash,bytes:sql.length}]}},{
    async readMigrationFile(){return sql;},async run(){return {stdout:'',stderr:''};},
    async collectCatalog(){return {postgresVersion:'17.6',discoveryGates:[{privateWrites:false,licensedWrites:false}],authorityKeyCount:0,rightsApprovalCount:0,
      tables:[{schema:'public',name:'trip_intents'},{schema:'public',name:'studio_threads'},{schema:'kinnso_internal',name:'discovery_gate'}],
      functions:[{schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb'},
        {schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb, jsonb'}]};},
    verifyTarget:()=>{},journal:{initialize:async()=>{},read:async()=>[{version:'20260101000000',name:'20260101000000_a.sql',sha256:hash}]}
  });
  assert.equal(result.runId,target.runId);assert.equal(result.sourceHash,target.sourceHash);assert.equal(result.migrationHash,target.migrationHash);assert.match(result.schemaHash,/^[a-f0-9]{64}$/);
});

test('live replay writes each journal row in the same SQL transaction as the migration',async()=>{
  const sql=Buffer.from('create table synthetic_example(id int);'),file={name:'20260101000000_a.sql',version:'20260101000000',sha256:createHash('sha256').update(sql).digest('hex')};
  let input;
  await applyMigrationBytes(target,file,sql,{async run(args,options){input=options.input;return {stdout:'',stderr:''};}},()=>{},true);
  assert.match(input.toString(),/create table synthetic_example/);
  assert.match(input.toString(),/insert into kinnso_na_control\.migration_journal/);
});

test('journal mismatch or duplicate server rows blocks schema receipt',async()=>{
  const sql=Buffer.from('select 1;'),hash=createHash('sha256').update(sql).digest('hex');
  const plan={...target,manifest:{hash:'b'.repeat(64),files:[{name:'20260101000000_a.sql',version:'20260101000000',sha256:hash,bytes:sql.length}]}};
  const base={readMigrationFile:async()=>sql,run:async()=>({stdout:'',stderr:''}),collectCatalog:async()=>({postgresVersion:'17.6',discoveryGates:[{privateWrites:false,licensedWrites:false}],authorityKeyCount:0,rightsApprovalCount:0,
    tables:[{schema:'public',name:'trip_intents'},{schema:'public',name:'studio_threads'},{schema:'kinnso_internal',name:'discovery_gate'}],
    functions:[{schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb'},{schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb, jsonb'}]}),verifyTarget:()=>{}};
  await assert.rejects(migrateAgainstTarget(plan,{...base,journal:{initialize:async()=>{},read:async()=>[]}}),{code:'MIGRATION_JOURNAL_MISMATCH'});
  await assert.rejects(migrateAgainstTarget(plan,{...base,journal:{initialize:async()=>{},read:async()=>[{version:'20260101000000',name:'20260101000000_a.sql',sha256:hash},{version:'20260101000000',name:'20260101000000_a.sql',sha256:hash}]}}),{code:'MIGRATION_JOURNAL_MISMATCH'});
});

test('exact journal prefix resumes, while foreign or changed history cannot be reused',async()=>{
  const first=Buffer.from('select 1;'),second=Buffer.from('select 2;'),file=(name,version,bytes)=>({name,version,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  const files=[file('20260101000000_a.sql','20260101000000',first),file('20260101000001_b.sql','20260101000001',second)];
  const plan={...target,manifest:{hash:'b'.repeat(64),files}},calls=[];let reads=0;
  const common={readMigrationFile:async entry=>Buffer.from(entry.name.endsWith('_a.sql')?first:second),run:async(args,options)=>{calls.push(options.input.toString());return {stdout:'',stderr:''};},
    collectCatalog:async()=>({postgresVersion:'17.6',discoveryGates:[{privateWrites:false,licensedWrites:false}],authorityKeyCount:0,rightsApprovalCount:0,
      tables:[{schema:'public',name:'trip_intents'},{schema:'public',name:'studio_threads'},{schema:'kinnso_internal',name:'discovery_gate'}],
      functions:[{schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb'},{schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb, jsonb'}]}),verifyTarget:()=>{}};
  const result=await migrateAgainstTarget(plan,{...common,journal:{initialize:async()=>{},read:async()=>++reads===1?
    [{version:files[0].version,name:files[0].name,sha256:files[0].sha256}]:
    [{version:files[0].version,name:files[0].name,sha256:files[0].sha256},{version:files[1].version,name:files[1].name,sha256:files[1].sha256}]}});
  assert.equal(calls.length,1);assert.equal(result.serverJournal.length,2);
  await assert.rejects(migrateAgainstTarget(plan,{...common,journal:{initialize:async()=>{},read:async()=>[{version:files[0].version,name:'foreign.sql',sha256:files[0].sha256}]}}),{code:'MIGRATION_JOURNAL_MISMATCH'});
});
test('run-time schema verification recomputes live journal and catalog instead of trusting the file',async()=>{
  const topology={...target,containerIds:['db1','auth1','rest1','gw1'],imageDigests:{db:'1',auth:'2',rest:'3',gateway:'4'}};
  const journalRows=[{version:'20260101000000',name:'20260101000000_a.sql',sha256:'c'.repeat(64)}];
  const catalog={postgresVersion:'17.6',discoveryGates:[{privateWrites:false,licensedWrites:false}],authorityKeyCount:0,rightsApprovalCount:0,
    tables:[{schema:'public',name:'trip_intents'},{schema:'public',name:'studio_threads'},{schema:'kinnso_internal',name:'discovery_gate'}],
    functions:[{schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb'},
      {schema:'public',name:'apply_kinnso_discovery_command',args:'uuid, integer, uuid, jsonb, jsonb'}]};
  const schemaHash=createHash('sha256').update(JSON.stringify({catalog,journal:journalRows})).digest('hex');
  const schema={targetHash:targetIdentityHash(topology),serverJournal:journalRows,schemaHash};
  const result=await verifySchemaReceipt(topology,schema,{verifyTarget:()=>{},journal:{read:async()=>journalRows},collectCatalog:async()=>catalog});
  assert.equal(result.status,'LIVE_SCHEMA_VERIFIED');
  await assert.rejects(verifySchemaReceipt(topology,{...schema,schemaHash:'d'.repeat(64)},{verifyTarget:()=>{},journal:{read:async()=>journalRows},collectCatalog:async()=>catalog}),{code:'LIVE_SCHEMA_DRIFT'});
});
