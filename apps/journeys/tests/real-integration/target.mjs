// No SDK, dotenv, browser or real client imports in this module.
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {freemem} from 'node:os';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import path from 'node:path';
import {assertRealSuiteSource,readRealSuiteApproval,SourceInputBlocked} from '../../scripts/real-suite-source.mjs';
const {fetch,AbortSignal}=globalThis;

const reviewedBodies={
 actor:'b8f53a233c2eb381bfc12517ca3b6912f2c3a8b392cb0d7ccf46ee7cc1ea326d',
 create:'93e1bcd47719fe36c9c6fc4ab5e6eeb8465ad35a8f4735d5d1c70758f51f8528',
 adopt:'a147d71db70a7e80b8cf14db735d07468f648f844caa5e3e196671d8e617392f',
 receipt:'74d243260df4d72d2f13fea3936b2f23297ea794471a271203239d515eced62c',
};
export const root=fileURLToPath(new URL('../../../../',import.meta.url));
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=value=>createHash('sha256').update(value).digest('hex');
export class Blocked extends Error {constructor(code){super(code);this.name='IntegrationBlocked';this.code=code}}
const requireGate=(condition,code)=>{if(!condition)throw new Blocked(code)};
const parseUrl=value=>{try{return new URL(value)}catch{throw new Blocked('MALFORMED_UPSTREAM')}};
const defaultProject='kinnsoos-trip-it-20261016';
const projectName=value=>{
 requireGate(/^[a-z0-9-]{8,80}$/.test(value??''),'TARGET_PROJECT_INVALID');
 return value;
};
const localOrigin=(name,fallback)=>{
 const value=process.env[name]??fallback;
 let url;try{url=new URL(value)}catch{throw new Blocked('TARGET_ORIGIN_INVALID')}
 const port=url.port||'80';
 requireGate(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/'&&
  !url.username&&!url.password&&!url.search&&!url.hash&&/^\d{2,5}$/.test(port)&&
  Number(port)>0&&Number(port)<65536,'TARGET_ORIGIN_INVALID');
 return {origin:'http://127.0.0.1:'+port,port};
};
export const project=projectName(process.env.KINNSO_REAL_IT_PROJECT??defaultProject);
const api=localOrigin('KINNSO_REAL_IT_API_ORIGIN','http://127.0.0.1:59521');
const app=localOrigin('KINNSO_REAL_IT_APP_ORIGIN','http://127.0.0.1:3497');
const dbPort=process.env.KINNSO_REAL_IT_DB_PORT??'59522';
requireGate(/^\d{2,5}$/.test(dbPort)&&Number(dbPort)>0&&Number(dbPort)<65536,'TARGET_DB_PORT_INVALID');
export const expected={project,upstreamProject:projectName(process.env.KINNSO_REAL_IT_UPSTREAM_PROJECT??project),
 apiOrigin:api.origin,appOrigin:app.origin,dbPort,network:'supabase_network_'+project,volume:'supabase_db_'+project};
export function validateApproval(approval,head,{now=Date.now(),memory=freemem()}={}){
 requireGate(approval?.approved===true&&typeof approval.approvalId==='string'&&approval.approvalId.length>0,'APPROVAL_REQUIRED');
 requireGate(approval.project===project&&approval.apiOrigin===expected.apiOrigin&&approval.appOrigin===expected.appOrigin,'TARGET_NOT_APPROVED');
 requireGate(approval.productHead===head&&/^[a-f0-9]{40}$/.test(head),'SOURCE_DRIFT');
 requireGate(/^[a-f0-9]{64}$/.test(approval.sourceArchiveSha256??''),'APPROVED_SOURCE_ARCHIVE_REQUIRED');
 requireGate(uuid.test(approval.runId)&&Number.isFinite(Date.parse(approval.expiresAt))&&Date.parse(approval.expiresAt)>now,'APPROVAL_EXPIRED_OR_INVALID');
 requireGate(['create-owned-fixtures','delete-owned-fixtures','real-api-db-browser'].every(scope=>approval.scopes?.includes(scope)),'SCOPE_MISSING');
 const continuedTwoGiB=approval.testAttempt===21&&
  approval.resourceAuthorization?.kind==='continued-human-2gib-after-20-20261017'&&
  approval.localContinuation?.approved===true&&
  approval.localContinuation.kind==='continue-after-reconciled-attempt20'&&approval.localContinuation.previousAttempt===20&&
  ['previousHoldSha256','previousResultSha256','zeroResidueSha256'].every(key=>/^[a-f0-9]{64}$/.test(approval.localContinuation[key]??''));
 const scopedTwoGiB=approval.runId==='c731fc3e-38be-4f79-b333-5757b2a72497'&&
  approval.minimumFreeDiskBytes===6*1024**3&&approval.resourceAuthorization?.approved===true&&
  (approval.testAttempt===20&&approval.resourceAuthorization.kind==='human-approved-attempt20-2gib-20261017'||continuedTwoGiB)&&
  approval.resourceAuthorization.minimumFreeMemoryBytes===2*1024**3&&
  approval.resourceAuthorization.minimumFreeDiskBytes===6*1024**3;
 const coldStartTwoGiB=approval.coldStartTarget?.approved===true&&
  approval.coldStartTarget.kind==='schema-clone-fresh-target-20261018'&&
  approval.coldStartTarget.project===project&&approval.coldStartTarget.upstreamProject===expected.upstreamProject&&
  approval.coldStartTarget.network===expected.network&&approval.coldStartTarget.volume===expected.volume&&
  approval.coldStartTarget.migrationMode==='SCHEMA_CLONE_ONLY_NO_MIGRATION_FILES'&&
  approval.coldStartTarget.emptyBaseline===true&&approval.minimumFreeDiskBytes===6*1024**3&&
  approval.resourceAuthorization?.approved===true&&
  approval.resourceAuthorization.minimumFreeMemoryBytes===2*1024**3&&
  approval.resourceAuthorization.minimumFreeDiskBytes===6*1024**3;
 const staleTabTwoGiB=project===defaultProject&&
  approval.runId==='c731fc3e-38be-4f79-b333-5757b2a72497'&&approval.testSelection==='STALE_TAB_4'&&
  approval.minimumFreeDiskBytes===6*1024**3&&approval.resourceAuthorization?.approved===true&&
  approval.resourceAuthorization.kind==='human-approved-stale-tab-2-6-gib-20261018'&&
  approval.resourceAuthorization.minimumFreeMemoryBytes===2*1024**3&&
  approval.resourceAuthorization.minimumFreeDiskBytes===6*1024**3&&
  ['renewalReceiptSha256','gatewayConfigSha256'].every(key=>/^[a-f0-9]{64}$/.test(approval.resourceAuthorization[key]??''));
 const todaySliceTwoGiB=project===defaultProject&&
  approval.runId==='c731fc3e-38be-4f79-b333-5757b2a72497'&&approval.testSelection==='TODAY_SLICE_4'&&
  approval.minimumFreeDiskBytes===6*1024**3&&approval.resourceAuthorization?.approved===true&&
  approval.resourceAuthorization.kind==='human-approved-today-slice-2-6-gib-20261019'&&
  approval.resourceAuthorization.minimumFreeMemoryBytes===2*1024**3&&
  approval.resourceAuthorization.minimumFreeDiskBytes===6*1024**3&&
  ['renewalReceiptSha256','gatewayConfigSha256'].every(key=>/^[a-f0-9]{64}$/.test(approval.resourceAuthorization[key]??''));
 requireGate(approval.minimumFreeMemoryBytes===3*1024**3||
  (scopedTwoGiB||coldStartTwoGiB||staleTabTwoGiB||todaySliceTwoGiB)&&approval.minimumFreeMemoryBytes===2*1024**3,'APPROVED_RAM_THRESHOLD_MISMATCH');
 const readingValid=Number.isFinite(memory)&&memory>0;
 if(!readingValid||memory<approval.minimumFreeMemoryBytes){
  const error=new Blocked(readingValid?
   approval.minimumFreeMemoryBytes===2*1024**3?'RESOURCE_GATE_FREE_RAM_BELOW_2_GIB':'RESOURCE_GATE_FREE_RAM_BELOW_3_GIB':
   'RESOURCE_GATE_READING_INVALID');
  error.resourceGate={readingValid,freeBytes:readingValid?memory:null,minimumBytes:approval.minimumFreeMemoryBytes};
  error.message=error.code+' freeBytes='+error.resourceGate.freeBytes+
   ' minimumBytes='+approval.minimumFreeMemoryBytes+' readingValid='+readingValid;
  throw error;
 }
 return approval;
}
export function assertSafeLedger(value){
 const visit=item=>{
  if(Array.isArray(item)){item.forEach(visit);return}
  if(item&&typeof item==='object')for(const [key,nested] of Object.entries(item)){
   requireGate(!/password|token|secret|authorization|cookie|storageState|connectionString|databaseUrl/i.test(key),'SENSITIVE_EVIDENCE_FIELD');
   visit(nested);
  }
 };
 visit(value);
 return value;
}
export function attestDocker(approval,attestation,{containers,network,volume,portOwners,kongConfig,appPortOwner}){
 requireGate(attestation?.project===project&&attestation.runId===approval.runId,'ATTESTATION_SCOPE_MISMATCH');
 requireGate(attestation.sourceArchiveSha256===approval.sourceArchiveSha256,'APPROVED_SOURCE_ARCHIVE_MISMATCH');
 requireGate(Date.parse(volume.CreatedAt)>=Date.parse(approval.createdAt),'VOLUME_PREDATES_APPROVAL');
 requireGate(volume.Name===expected.volume&&network.Name===expected.network&&network.Internal===true,'NETWORK_OR_VOLUME_NOT_ISOLATED');
 requireGate(network.Options?.['com.docker.network.bridge.host_binding_ipv4']==='127.0.0.1','NETWORK_BINDING_NOT_LOOPBACK');
 requireGate(network.Id===attestation.networkId&&volume.Labels?.['com.supabase.cli.project']===project,'RESOURCE_OWNER_MISMATCH');
 for(const kind of ['db','kong','rest','auth']){
  const c=containers.find(row=>row.Name==='/supabase_'+kind+'_'+project);
  requireGate(c?.State?.Running&&c.Id===attestation.containerIds?.[kind]&&/^[a-f0-9]{64}$/.test(c.Id),'CONTAINER_IDENTITY_MISMATCH');
  requireGate(c.Config?.Labels?.['com.supabase.cli.project']===project&&c.Config?.Labels?.['com.docker.compose.project']===project,'CONTAINER_OWNER_MISMATCH');
  requireGate(c.Image===approval.imageIds?.[kind]&&c.Image===attestation.imageIds?.[kind]&&Object.keys(c.NetworkSettings?.Networks??{}).length===1&&c.NetworkSettings.Networks[expected.network]?.NetworkID===network.Id,'CONTAINER_IMAGE_OR_NETWORK_MISMATCH');
  const allowedPort=kind==='db'?'5432/tcp':kind==='kong'?'8000/tcp':null;
  requireGate(Object.entries(c.NetworkSettings.Ports??{}).every(([port,bindings])=>!bindings?.length||port===allowedPort),'UNAPPROVED_PUBLISHED_PORT');
 }
 requireGate(Object.keys(network.Containers??{}).length===4,'UNEXPECTED_NETWORK_MEMBER');
 const db=containers.find(c=>c.Name==='/supabase_db_'+project),gateway=containers.find(c=>c.Name==='/supabase_kong_'+project);
 requireGate(db.Mounts?.some(m=>m.Type==='volume'&&m.Name===expected.volume&&m.Destination==='/var/lib/postgresql/data'),'DB_VOLUME_MISMATCH');
 requireGate(db.Mounts.every(m=>m.Type==='volume'?m.Name===expected.volume:m.Type==='tmpfs'||m.Type==='bind'&&m.RW===false&&approval.allowedReadOnlyBindSources?.includes(m.Source)),'FOREIGN_DB_MOUNT');
 const coldStartRelay=approval.coldStartTarget?.transportApproval;
 const permission=approval.transportApproval??coldStartRelay;
 const relayed=!!permission||!!attestation.transport;
 for(const [c,internal,hostPort] of [[db,'5432/tcp',expected.dbPort],[gateway,'8000/tcp',new URL(expected.apiOrigin).port]]){
  const bindings=c.NetworkSettings.Ports?.[internal];
  if(relayed){
   requireGate(Array.isArray(bindings)&&bindings.length===0&&JSON.stringify(c.HostConfig?.PortBindings?.[internal])===JSON.stringify([{HostIp:'127.0.0.1',HostPort:hostPort}]),'RELAY_DECLARED_PORT_CONTRACT_MISMATCH');
  }else requireGate(bindings?.length===1&&bindings[0].HostIp==='127.0.0.1'&&bindings[0].HostPort===hostPort,'PORT_BINDING_MISMATCH');
 }
 if(relayed){
  const relay=attestation.transport;
  requireGate(permission?.approved===true&&permission.kind==='owned-kong-exec-relay'&&permission.runId===approval.runId&&
   (approval.runId==='c731fc3e-38be-4f79-b333-5757b2a72497'||
    coldStartRelay===permission&&approval.coldStartTarget?.approved===true),'RELAY_NOT_APPROVED');
  requireGate(relay?.kind===permission.kind&&relay.kongId===gateway.Id&&permission.kongId===gateway.Id&&relay.dbPeerContainerId===db.Id,'RELAY_CONTAINER_SCOPE_MISMATCH');
  requireGate(relay.host==='127.0.0.1'&&relay.port===Number(new URL(expected.apiOrigin).port)&&Number.isInteger(relay.pid)&&relay.pid>0&&portOwners.api===relay.pid&&portOwners.db===null,'RELAY_LISTENER_OWNER_MISMATCH');
  requireGate(/^[a-f0-9]{64}$/.test(permission.relaySourceSha256??'')&&relay.sourceSha256===permission.relaySourceSha256&&JSON.stringify(relay.command)===JSON.stringify(['busybox','nc','-w','15','127.0.0.1','8000']),'RELAY_SOURCE_OR_COMMAND_MISMATCH');
  requireGate(network.Labels?.['org.kinnso.it.run']===approval.runId&&volume.Labels?.['org.kinnso.it.run']===approval.runId&&containers.every(c=>c.Config.Labels?.['org.kinnso.it.run']===approval.runId),'RELAY_RUN_OWNERSHIP_MISMATCH');
 }else requireGate(portOwners.api===gateway.Id&&portOwners.db===db.Id,'PORT_OWNER_MISMATCH');
 requireGate(appPortOwner===attestation.appPid,'APP_PORT_OWNER_MISMATCH');
 const setting=(c,key)=>{const matches=c.Config.Env?.filter(v=>v.startsWith(key+'='));requireGate(matches?.length===1,'UPSTREAM_SETTING_MISSING');return matches[0].slice(key.length+1)};
 for(const [kind,key] of [['rest','PGRST_DB_URI'],['auth','GOTRUE_DB_DATABASE_URL']]){
  const uri=parseUrl(setting(containers.find(c=>c.Name==='/supabase_'+kind+'_'+project),key));
  requireGate(['postgres:','postgresql:'].includes(uri.protocol)&&uri.hostname==='supabase_db_'+expected.upstreamProject&&uri.port==='5432'&&uri.pathname==='/postgres'&&!uri.search&&!uri.hash,'DB_UPSTREAM_MISMATCH');
 }
 requireGate(!/^[ \t]*paths:[ \t]*\S/m.test(kongConfig),'UNREVIEWED_GATEWAY_FORMAT');
 requireGate(sha(kongConfig)===attestation.gatewayConfigSha256,'GATEWAY_CONFIG_DRIFT');
 const services=kongConfig.split(/^ {2}- name: /m).slice(1).map(block=>({name:block.split(/\r?\n/)[0],urls:[...block.matchAll(/^ {4}url: (\S+)\s*$/gm)].map(m=>m[1]),paths:[...block.matchAll(/^ {10}- (\S+)\s*$/gm)].map(m=>m[1])}));
 for(const service of services)for(const route of service.paths)requireGate(route.startsWith('/')&&!/[\\%~]/.test(route),'UNREVIEWED_GATEWAY_ROUTE');
 for(const [prefix,kind,port] of [['/auth/v1/','auth','9999'],['/rest/v1/','rest','3000']]){
  const overlaps=services.filter(s=>s.paths.some(p=>p.startsWith(prefix)||prefix.startsWith(p)));
  requireGate(overlaps.length===1&&overlaps[0].paths.includes(prefix)&&overlaps[0].urls.length===1,'GATEWAY_ROUTE_SHADOW_OR_MISSING');
  const upstream=parseUrl(overlaps[0].urls[0]);
  requireGate(upstream.origin===`http://supabase_${kind}_${expected.upstreamProject}:${port}`&&upstream.pathname==='/'&&!upstream.username&&!upstream.password&&!upstream.search&&!upstream.hash,'GATEWAY_UPSTREAM_MISMATCH');
 }
 return {project,networkId:network.Id,containerIds:{...attestation.containerIds},imageIds:{...attestation.imageIds},apiOrigin:expected.apiOrigin,appOrigin:expected.appOrigin};
}
export function validateSchema(catalog,versions,{empty=true}={}){
 requireGate(catalog?.database==='postgres'&&catalog.serverVersionNum>=170000&&catalog.serverVersionNum<180000,'DATABASE_IDENTITY_OR_VERSION_MISMATCH');
 requireGate(JSON.stringify(catalog.migrationVersions)===JSON.stringify(versions),'MIGRATION_SET_MISMATCH');
 for(const flag of ['tripRequestsRls','tripRequestsPrivate','actorRequestPk','receiptDefiner','receiptExecuteAuthOnly','receiptSearchPathEmpty','cronJobsHeld','receiptTripOwnershipCheck'])requireGate(catalog[flag]===true,'SCHEMA_SAFETY_'+flag);
 requireGate(['actor','create','adopt','receipt'].every(name=>/^[a-f0-9]{64}$/.test(catalog.functionHashes?.[name]?.sha256??'')),'FUNCTION_FINGERPRINT_MISSING');
 requireGate(Object.entries(reviewedBodies).every(([name,hash])=>catalog.functionHashes[name].bodySha256===hash),'FUNCTION_BODY_SOURCE_DRIFT');
 if(empty)requireGate(['authUsers','trips','guides','tripRequests'].every(name=>catalog.baseline?.[name]===0),'FIXTURE_BASELINE_NOT_EMPTY');
 return sha(JSON.stringify(catalog.functionHashes));
}
function execute(args,{input,env}={}){
 try{return String(execFileSync(args[0],args.slice(1),{cwd:root,input,env:env??process.env,encoding:'utf8',windowsHide:true,timeout:20000,stdio:['pipe','pipe','pipe'],maxBuffer:3*1024*1024}))}
 catch{throw new Blocked('IDENTITY_OR_CATALOG_COMMAND_FAILED')}
}
export function bootstrapFile(approval,approvalFile,name){
 requireGate(['loopback-relay.mjs','runtime-http.mjs'].includes(name),'BOOTSTRAP_FILE_NOT_APPROVED');
 let privateRoot=path.resolve(root,'../../.local-private');
 if(approval.testSelection==='TODAY_SLICE_4'){
  requireGate(path.isAbsolute(approvalFile)&&
   approval.resourceAuthorization?.kind==='human-approved-today-slice-2-6-gib-20261019','BOOTSTRAP_SCOPE_MISMATCH');
  privateRoot=path.resolve(path.dirname(approvalFile),'..');
  requireGate(path.basename(privateRoot)==='.local-private','BOOTSTRAP_PRIVATE_ROOT_REQUIRED');
 }
 return path.join(privateRoot,'guide-real-integration-20261016/bootstrap',name);
}
export async function verifyTarget(env=process.env,{empty=true}={}){
 requireGate(!!env.KINNSO_REAL_IT_APPROVAL_FILE&&!!env.KINNSO_REAL_IT_ATTESTATION_FILE,'APPROVAL_REQUIRED');
 let approval;
 try{
  approval=readRealSuiteApproval(env);
  // Re-read selection at this entry point; the runner's earlier approval read
  // cannot authorize metadata access for a subsequently changed selection.
  assertRealSuiteSource({testSelection:approval.testSelection});
 }catch(error){
  if(!(error instanceof SourceInputBlocked))throw error;
  const blocked=new Blocked(error.code);
  for(const key of ['testSelection','expectedCaseCount','missingInputs'])
   if(Object.hasOwn(error,key))blocked[key]=error[key];
  throw blocked;
 }
 const head=execute(['git','rev-parse','HEAD']).trim();validateApproval(approval,head);
 let attestation;try{attestation=JSON.parse(readFileSync(env.KINNSO_REAL_IT_ATTESTATION_FILE,'utf8'))}catch{throw new Blocked('APPROVAL_RECORD_UNREADABLE')}
 const docker=(args,options)=>execute(['docker','--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],options);
 const names=['db','kong','rest','auth'].map(kind=>'supabase_'+kind+'_'+project);
 let containers,network,volume;try{containers=JSON.parse(docker(['inspect',...names]));[network]=JSON.parse(docker(['network','inspect',expected.network]));[volume]=JSON.parse(docker(['volume','inspect',expected.volume]))}catch{throw new Blocked('DOCKER_IDENTITY_UNAVAILABLE')}
 const apiPort=new URL(expected.apiOrigin).port,appPort=new URL(expected.appOrigin).port;
 const owner=port=>{const rows=docker(['ps','--no-trunc','--filter','publish='+port,'--format','{{.ID}}']).trim().split(/\r?\n/).filter(Boolean);return rows.length===1?rows[0]:null};
 const listener=execute(['netstat','-ano','-p','tcp']).split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts[0]==='TCP'&&parts[1]==='127.0.0.1:'+appPort&&parts[3]==='LISTENING');
 let apiOwner=owner(apiPort);
 const transportApproval=approval.transportApproval??approval.coldStartTarget?.transportApproval;
 if(transportApproval){
  const configuredRelay=approval.coldStartTarget?.relaySourceFile;
  const relayPath=configuredRelay
   ?path.resolve(configuredRelay)
   :bootstrapFile(approval,env.KINNSO_REAL_IT_APPROVAL_FILE,'loopback-relay.mjs');
  if(configuredRelay)requireGate(
   relayPath.startsWith(path.resolve(root,'../../.local-private')+path.sep),'RELAY_SOURCE_PATH');
  requireGate(sha(readFileSync(relayPath))===transportApproval.relaySourceSha256,'RELAY_SOURCE_DRIFT');
  const relayListeners=execute(['netstat','-ano','-p','tcp']).split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts[0]==='TCP'&&parts[1]?.split(':').at(-1)===apiPort&&parts[3]==='LISTENING');
  requireGate(relayListeners.length===1&&relayListeners[0][1]==='127.0.0.1:'+apiPort,'RELAY_BINDING_MISMATCH');
  apiOwner=Number(relayListeners[0][4]);
 }
 const kongConfig=docker(['exec',attestation.containerIds.kong,'cat','/home/kong/kong.yml']);
 const identity=attestDocker(approval,attestation,{containers,network,volume,portOwners:{api:apiOwner,db:owner(expected.dbPort)},kongConfig,appPortOwner:listener.length===1?Number(listener[0][4]):null});
 const files=readdirSync(path.join(root,'supabase/migrations')).filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort();
 const hashes=Object.fromEntries(files.map(n=>[n,sha(readFileSync(path.join(root,'supabase/migrations',n)))]));
 requireGate(sha(JSON.stringify(hashes))===approval.migrationManifestSha256,'MIGRATION_SOURCE_DRIFT');
 const sql=readFileSync(new URL('./target-catalog.sql',import.meta.url),'utf8');
 const output=docker(['exec','-i','--env','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000',attestation.containerIds.db,'psql','-X','-q','-t','-A','--no-password','--username=postgres','--dbname=postgres','--set=ON_ERROR_STOP=1'],{input:sql});
 let catalog;try{catalog=JSON.parse(output)}catch{throw new Blocked('CATALOG_RESPONSE_INVALID')}
 const schemaFingerprint=validateSchema(catalog,files.map(n=>n.slice(0,14)),{empty});
 const response=await fetch(expected.appOrigin+'/source/kinnsoos-source.zip',{headers:{Connection:'close'},redirect:'error',signal:AbortSignal.timeout(10000)});
 requireGate(response.status===200&&sha(Buffer.from(await response.arrayBuffer()))===attestation.sourceArchiveSha256,'APP_PRODUCTION_SOURCE_MISMATCH');
 return {approval,identity,catalog,schemaFingerprint,head};
}
