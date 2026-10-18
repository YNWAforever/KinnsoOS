import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {URL} from 'node:url';
import {validateApproval,validateSchema,assertSafeLedger,verifyTarget,attestDocker,Blocked,expected} from './real-integration/target.mjs';
const head='d'.repeat(40),approval={approved:true,approvalId:'human-scope-receipt',project:expected.project,apiOrigin:expected.apiOrigin,appOrigin:expected.appOrigin,productHead:head,sourceArchiveSha256:'a'.repeat(64),runId:'11111111-1111-4111-8111-111111111111',expiresAt:'2030-01-01T00:00:00Z',minimumFreeMemoryBytes:3*1024**3,scopes:['create-owned-fixtures','delete-owned-fixtures','real-api-db-browser']};
const options={now:Date.parse('2026-10-16T00:00:00Z'),memory:8*1024**3};
function runtime(){
 const kinds=['db','kong','rest','auth'],ids=Object.fromEntries(kinds.map((kind,i)=>[kind,String(i+1).repeat(64)])),imageIds=Object.fromEntries(kinds.map((kind,i)=>[kind,'sha256:'+String(i+5).repeat(64)]));
 const network={Name:expected.network,Id:'a'.repeat(64),Internal:true,Options:{'com.docker.network.bridge.host_binding_ipv4':'127.0.0.1'},Containers:Object.fromEntries(Object.values(ids).map(id=>[id,{}]))};
 const config=['auth','rest'].map((kind,i)=>`  - name: ${kind}-v1\n    url: http://supabase_${kind}_${expected.project}:${i?3000:9999}/\n    routes:\n      - name: ${kind}-route\n        paths:\n          - /${kind}/v1/\n`).join('');
 const containers=kinds.map(kind=>({Name:'/supabase_'+kind+'_'+expected.project,Id:ids[kind],Image:imageIds[kind],State:{Running:true},Config:{Labels:{'com.supabase.cli.project':expected.project,'com.docker.compose.project':expected.project},Env:kind==='rest'||kind==='auth'?[(kind==='rest'?'PGRST_DB_URI':'GOTRUE_DB_DATABASE_URL')+`=postgresql://supabase_db_${expected.project}:5432/postgres`]:[]},NetworkSettings:{Networks:{[expected.network]:{NetworkID:network.Id}},Ports:kind==='db'?{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'59522'}]}:kind==='kong'?{'8000/tcp':[{HostIp:'127.0.0.1',HostPort:'59521'}]}:{}},Mounts:kind==='db'?[{Type:'volume',Name:expected.volume,Destination:'/var/lib/postgresql/data'}]:[]}));
 const record={...approval,createdAt:'2026-10-16T00:00:00Z',imageIds:{...imageIds}};
 return{record,attestation:{project:expected.project,runId:approval.runId,sourceArchiveSha256:approval.sourceArchiveSha256,containerIds:ids,imageIds,networkId:network.Id,appPid:1234,gatewayConfigSha256:createHash('sha256').update(config).digest('hex')},metadata:{containers,network,volume:{Name:expected.volume,CreatedAt:'2026-10-16T01:00:00Z',Labels:{'com.supabase.cli.project':expected.project}},portOwners:{api:ids.kong,db:ids.db},appPortOwner:1234,kongConfig:config}};
}
test('real metadata must match approved immutable images, volume, network, ports and gateway routes',()=>{
 const good=runtime();assert.equal(attestDocker(good.record,good.attestation,good.metadata).project,expected.project);
 for(const mutate of [
  row=>{row.metadata.network.Internal=false},
  row=>{row.metadata.volume.CreatedAt='2020-01-01'},
  row=>{row.metadata.appPortOwner=2222},
  row=>{row.attestation.sourceArchiveSha256='f'.repeat(64)},
  row=>{row.metadata.containers[2].NetworkSettings.Ports={'3000/tcp':[{HostIp:'0.0.0.0',HostPort:'59523'}]}},
  row=>{row.metadata.containers[0].Image='sha256:'+'f'.repeat(64);row.attestation.imageIds.db=row.metadata.containers[0].Image},
  row=>{row.metadata.kongConfig+='  - name: shadow\n    url: https://unapproved.invalid/\n    routes:\n      - name: shadow\n        paths:\n          - ~^/auth/v1\n'},
 ]){const bad=runtime();mutate(bad);assert.throws(()=>attestDocker(bad.record,bad.attestation,bad.metadata),Blocked)}
});
test('approved same-run relay binds its listener, Kong, peer DB and exact command while retaining isolation',()=>{
 function relayed(){
  const row=runtime();
  row.record.runId=row.attestation.runId='c731fc3e-38be-4f79-b333-5757b2a72497';
  row.record.transportApproval={approved:true,kind:'owned-kong-exec-relay',runId:row.record.runId,kongId:row.attestation.containerIds.kong,relaySourceSha256:'b'.repeat(64)};
  row.attestation.transport={kind:'owned-kong-exec-relay',pid:5678,host:'127.0.0.1',port:59521,kongId:row.attestation.containerIds.kong,dbPeerContainerId:row.attestation.containerIds.db,command:['busybox','nc','-w','15','127.0.0.1','8000'],sourceSha256:'b'.repeat(64)};
  row.metadata.portOwners={api:5678,db:null};
  row.metadata.network.Labels={'org.kinnso.it.run':row.record.runId};
  row.metadata.volume.Labels['org.kinnso.it.run']=row.record.runId;
  for(const container of row.metadata.containers){
   container.Config.Labels['org.kinnso.it.run']=row.record.runId;
   container.HostConfig={PortBindings:globalThis.structuredClone(container.NetworkSettings.Ports)};
   for(const key of Object.keys(container.NetworkSettings.Ports))container.NetworkSettings.Ports[key]=[];
  }
  return row;
 }
 const good=relayed();assert.equal(attestDocker(good.record,good.attestation,good.metadata).project,expected.project);
 for(const mutate of [
  row=>{row.record.transportApproval.approved=false},
  row=>{row.attestation.transport.host='0.0.0.0'},
  row=>{row.attestation.transport.pid=1111},
  row=>{row.attestation.transport.kongId='f'.repeat(64)},
  row=>{row.attestation.transport.dbPeerContainerId='f'.repeat(64)},
  row=>{row.attestation.transport.command[5]='5432'},
  row=>{row.attestation.transport.sourceSha256='c'.repeat(64)},
  row=>{row.metadata.network.Internal=false},
  row=>{row.metadata.network.Containers['f'.repeat(64)]={}},
  row=>{row.metadata.containers[0].Config.Labels['org.kinnso.it.run']='another-run'},
 ]){const bad=relayed();mutate(bad);assert.throws(()=>attestDocker(bad.record,bad.attestation,bad.metadata),Blocked)}
});
test('real integration has no client or network side effect without explicit authorization',async()=>{
 await assert.rejects(verifyTarget({}),error=>error instanceof Blocked&&error.code==='APPROVAL_REQUIRED');
});
test('localhost, TEST names and an active pilot never qualify as approval',()=>{
 for(const change of [{approved:false},{project:'kinnsoos-pilot-20261013'},{apiOrigin:'http://127.0.0.1:58421'},{productHead:'e'.repeat(40)},{scopes:[]},{expiresAt:'2020-01-01'}])assert.throws(()=>validateApproval({...approval,...change},head,options),Blocked);
});
test('readiness refuses the currently observed low-memory class before resource allocation',()=>{
 assert.throws(()=>validateApproval(approval,head,{...options,memory:1100*1024**2}),/RESOURCE_GATE/);
 assert.equal(validateApproval(approval,head,options),approval);
});
test('RAM gate binds the latest human-approved 3 GiB floor and rejects a different approval floor',()=>{
 const floor=3*1024**3;
 assert.equal(validateApproval(approval,head,{...options,memory:floor}),approval);
 for(const memory of [floor-1,0,-1,NaN,Infinity,-Infinity])
  assert.throws(()=>validateApproval(approval,head,{...options,memory}),/RESOURCE_GATE/);
 for(const minimumFreeMemoryBytes of [undefined,0,2*1024**3,4*1024**3,6*1024**3])
  assert.throws(()=>validateApproval({...approval,minimumFreeMemoryBytes},head,options),/APPROVED_RAM_THRESHOLD_MISMATCH/);
});
test('cold-start 2 GiB approval requires the exact schema-clone target scope',()=>{
 const coldStart={...approval,minimumFreeMemoryBytes:2*1024**3,minimumFreeDiskBytes:6*1024**3,
  resourceAuthorization:{approved:true,minimumFreeMemoryBytes:2*1024**3,minimumFreeDiskBytes:6*1024**3},
  coldStartTarget:{
  approved:true,kind:'schema-clone-fresh-target-20261018',project:expected.project,
  upstreamProject:expected.upstreamProject??expected.project,network:expected.network,volume:expected.volume,
  migrationMode:'SCHEMA_CLONE_ONLY_NO_MIGRATION_FILES',emptyBaseline:true,
 }};
 assert.equal(validateApproval(coldStart,head,{...options,memory:2*1024**3}),coldStart);
 for(const mutate of [
  row=>{row.coldStartTarget.approved=false},
  row=>{row.coldStartTarget.kind='unscoped-cold-start'},
  row=>{row.coldStartTarget.project='kinnsoos-pilot-20261013'},
  row=>{row.coldStartTarget.upstreamProject='foreign-upstream'},
  row=>{row.coldStartTarget.network='foreign-network'},
  row=>{row.coldStartTarget.volume='foreign-volume'},
  row=>{row.coldStartTarget.migrationMode='RUN_MIGRATIONS'},
  row=>{row.coldStartTarget.emptyBaseline=false},
  row=>{row.resourceAuthorization.minimumFreeDiskBytes=5*1024**3},
 ]){const bad=structuredClone(coldStart);mutate(bad);assert.throws(()=>validateApproval(bad,head,{...options,memory:2*1024**3}),Blocked)}
});
test('stale-tab 2 GiB approval is restricted to the original target, four cells and current receipt',()=>{
 const stale={...approval,runId:'c731fc3e-38be-4f79-b333-5757b2a72497',testSelection:'STALE_TAB_4',
  minimumFreeMemoryBytes:2*1024**3,minimumFreeDiskBytes:6*1024**3,
  resourceAuthorization:{approved:true,kind:'human-approved-stale-tab-2-6-gib-20261018',
   minimumFreeMemoryBytes:2*1024**3,minimumFreeDiskBytes:6*1024**3,
   renewalReceiptSha256:'b'.repeat(64),gatewayConfigSha256:'c'.repeat(64)}};
 assert.equal(validateApproval(stale,head,{...options,memory:2*1024**3}),stale);
 assert.throws(()=>validateApproval(stale,head,{...options,memory:2*1024**3-1}),/RESOURCE_GATE/);
 for(const mutate of [
  row=>{row.runId='11111111-1111-4111-8111-111111111111'},
  row=>{row.testSelection='TRAVELLER_CORE_12'},
  row=>{row.resourceAuthorization.approved=false},
  row=>{row.resourceAuthorization.kind='unscoped'},
  row=>{row.minimumFreeDiskBytes=4*1024**3},
  row=>{row.resourceAuthorization.minimumFreeDiskBytes=4*1024**3},
  row=>{delete row.resourceAuthorization.renewalReceiptSha256},
  row=>{delete row.resourceAuthorization.gatewayConfigSha256},
 ]){const bad=structuredClone(stale);mutate(bad);assert.throws(()=>validateApproval(bad,head,{...options,memory:2*1024**3}),Blocked)}
});
test('RAM failure preserves its exact sample and distinguishes invalid readings from actual low memory',()=>{
 const freeBytes=3*1024**3-1;
 assert.throws(()=>validateApproval(approval,head,{...options,memory:freeBytes}),error=>{
  assert.equal(error.code,'RESOURCE_GATE_FREE_RAM_BELOW_3_GIB');
  assert.deepEqual(error.resourceGate,{readingValid:true,freeBytes,minimumBytes:3*1024**3});
  return true;
 });
 for(const memory of [0,-1,NaN,Infinity,-Infinity])
  assert.throws(()=>validateApproval(approval,head,{...options,memory}),error=>{
   assert.equal(error.code,'RESOURCE_GATE_READING_INVALID');
   assert.deepEqual(error.resourceGate,{readingValid:false,freeBytes:null,minimumBytes:3*1024**3});
   return true;
  });
});
test('schema version, RLS, private receipts, scheduler hold and empty ownership baseline are mandatory',()=>{
 const bodies={actor:'b8f53a233c2eb381bfc12517ca3b6912f2c3a8b392cb0d7ccf46ee7cc1ea326d',create:'93e1bcd47719fe36c9c6fc4ab5e6eeb8465ad35a8f4735d5d1c70758f51f8528',adopt:'a147d71db70a7e80b8cf14db735d07468f648f844caa5e3e196671d8e617392f',receipt:'74d243260df4d72d2f13fea3936b2f23297ea794471a271203239d515eced62c'};
 const schema={database:'postgres',serverVersionNum:170006,migrationVersions:['1','2'],tripRequestsRls:true,tripRequestsPrivate:true,actorRequestPk:true,receiptDefiner:true,receiptExecuteAuthOnly:true,receiptSearchPathEmpty:true,cronJobsHeld:true,receiptTripOwnershipCheck:true,baseline:{authUsers:0,trips:0,guides:0,tripRequests:0},functionHashes:Object.fromEntries(Object.entries(bodies).map(([name,bodySha256])=>[name,{sha256:'a'.repeat(64),bodySha256}]))};
 assert.match(validateSchema(schema,['1','2']),/^[a-f0-9]{64}$/);
 for(const change of [{migrationVersions:['1']},{tripRequestsRls:false},{tripRequestsPrivate:false},{actorRequestPk:false},{cronJobsHeld:false},{baseline:{...schema.baseline,authUsers:1}},{baseline:{...schema.baseline,tripRequests:null}},{functionHashes:{...schema.functionHashes,actor:{sha256:'a'.repeat(64),bodySha256:'f'.repeat(64)}}}])assert.throws(()=>validateSchema({...schema,...change},['1','2']),Blocked);
 assert.throws(()=>validateSchema({...schema,functionHashes:{...schema.functionHashes,adopt:{sha256:'a'.repeat(64),bodySha256:'f362108e71d6b1cb8a33dc6e61770a3b9ba718eb4bbb9d141e1757dba77fdefe'}}},['1','2']),/FUNCTION_BODY_SOURCE_DRIFT/);
 assert.throws(()=>validateSchema({...schema,functionHashes:{...schema.functionHashes,adopt:{sha256:'a'.repeat(64),bodySha256:'fba1504f200848c9d93f60a82abd8fa2613fdf74e093abd52af5740a69884a48'}}},['1','2']),/FUNCTION_BODY_SOURCE_DRIFT/);
});
test('fixture setup also stops before credential reads and SDK import when approval is absent',async()=>{
 const {openFixture}=await import('./real-integration/fixture.mjs');
 await assert.rejects(openFixture({}),error=>error instanceof Blocked&&error.code==='APPROVAL_REQUIRED');
});
test('credential-shaped evidence is rejected recursively rather than redacted after writing',()=>{
 for(const key of ['password','access_token','refreshToken','authorization','cookies','storageState','connectionString','databaseUrl'])assert.throws(()=>assertSafeLedger({users:[{id:'synthetic',[key]:'not-a-real-credential'}]}),/SENSITIVE_EVIDENCE/);
 assert.deepEqual(assertSafeLedger({runId:approval.runId,users:[{id:'synthetic',actor:'A'}]}),{runId:approval.runId,users:[{id:'synthetic',actor:'A'}]});
});
test('new entry point cannot load a dotenv file or eagerly construct a Supabase client',()=>{
 const source=readFileSync(new URL('./real-integration/target.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/loadEnvFile\s*\(|dotenv\/config|createClient\s*\(/);
});
