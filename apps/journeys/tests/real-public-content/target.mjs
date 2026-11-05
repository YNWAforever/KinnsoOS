import {freemem} from 'node:os';
import {readFileSync,readdirSync,statfsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Blocked as BaseBlocked,assertSafeLedger} from '../real-integration/target.mjs';

export const root=fileURLToPath(new URL('../../../../',import.meta.url));
export class Blocked extends Error{constructor(code){super(code);this.name='PublicContentBlocked';this.code=code}}
const fail=code=>{throw new Blocked(code)};
const reserved=new Set(['kinnso-v3','kinnsoos-pilot-20261013','kinnsoos-trip-it-20261016','kinnsoos-suspension-it-20261105']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

function loopback(value,name){
 let url;try{url=new URL(value)}catch{fail('TARGET_INVALID')}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!url.port)fail('TARGET_INVALID');
 if(!/^\d{2,5}$/.test(url.port)||Number(url.port)<1||Number(url.port)>65535)fail('TARGET_INVALID');
 return url.origin;
}

export function publicTargetConfiguration(env=process.env){
 const project=env.KINNSO_PUBLIC_IT_PROJECT;
 if(typeof project!=='string'||!/^kinnsoos-public-it-[a-z0-9-]{4,60}$/.test(project)||reserved.has(project))fail('TARGET_PROJECT_INVALID');
 const dbPort=env.KINNSO_PUBLIC_IT_DB_PORT;
 if(typeof dbPort!=='string'||!/^\d{2,5}$/.test(dbPort)||Number(dbPort)<1||Number(dbPort)>65535)fail('TARGET_DB_PORT_INVALID');
 return {
  project,
  apiOrigin:loopback(env.KINNSO_PUBLIC_IT_API_ORIGIN,'api'),
  appOrigin:loopback(env.KINNSO_PUBLIC_IT_APP_ORIGIN,'app'),
  dbPort,
  network:'supabase_network_'+project,
  volume:'supabase_db_'+project,
 };
}

function freeDiskBytes(location=root){
 try{const value=statfsSync(location);return Number(value.bavail)*Number(value.bsize)}catch{return 0}
}

export function validatePublicApproval(approval,head,{now=Date.now(),memory=freemem(),disk=freeDiskBytes(),env=process.env}={}){
 const target=publicTargetConfiguration(env);
 if(!approval||approval.approved!==true||typeof approval.approvalId!=='string'||!approval.approvalId)throw new Blocked('APPROVAL_REQUIRED');
 if(approval.project!==target.project||approval.apiOrigin!==target.apiOrigin||approval.appOrigin!==target.appOrigin)throw new Blocked('TARGET_NOT_APPROVED');
 if(!/^[a-f0-9]{40}$/.test(head)||approval.productHead!==head)throw new Blocked('SOURCE_DRIFT');
 if(!digest(approval.sourceArchiveSha256)||!digest(approval.migrationManifestSha256))throw new Blocked('APPROVED_ARTIFACT_REQUIRED');
 if(!uuid.test(approval.runId??'')||!Number.isFinite(Date.parse(approval.createdAt))||!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=now)throw new Blocked('APPROVAL_EXPIRED_OR_INVALID');
 if(!['create-owned-fixtures','delete-owned-fixtures','real-api-db-browser'].every(scope=>approval.scopes?.includes(scope)))throw new Blocked('SCOPE_MISSING');
 if(approval.minimumFreeMemoryBytes!==3*1024**3||approval.minimumFreeDiskBytes!==6*1024**3)throw new Blocked('RESOURCE_THRESHOLD_INVALID');
 if(!Number.isFinite(memory)||!Number.isFinite(disk)||memory<approval.minimumFreeMemoryBytes||disk<approval.minimumFreeDiskBytes){
  const error=new Blocked('RESOURCE_GATE');error.resource={memory,disk,requiredMemory:approval.minimumFreeMemoryBytes,requiredDisk:approval.minimumFreeDiskBytes};throw error;
 }
 return {approval,target};
}

export function assertSafePublicEvidence(value){
 const visit=item=>{
  if(Array.isArray(item)){item.forEach(visit);return}
  if(item&&typeof item==='object')for(const [key,nested]of Object.entries(item)){
   if(/password|token|secret|authorization|cookie|storageState|connectionString|databaseUrl|service[_ -]?role/i.test(key))throw new Blocked('SENSITIVE_EVIDENCE');
   visit(nested);
  }
 };
 visit(value);return value;
}

export function classifyPublicRun(result){
 if(result?.error||result?.status===null||result?.signal)return 'BLOCKED_BEFORE_CASE_RESULTS';
 const output=String(result?.stdout??'');
 const totals=[...output.matchAll(/\b(\d+)\s+passed\b/g)].map(match=>Number(match[1]));
 if(result?.status===0&&totals.length===1&&totals[0]===8&&!/\b(?:failed|skipped|did not run)\b/i.test(output))return 'PASS_REAL_TARGET';
 if(/\b(?:failed|skipped|did not run)\b/i.test(output))return 'INCOMPLETE_REAL_TARGET';
 return 'INCONCLUSIVE_NO_CASE_RESULTS';
}

const sha=value=>createHash('sha256').update(value).digest('hex');

export async function verifyPublicTarget(env=process.env){
 const target=publicTargetConfiguration(env);
 if(!env.KINNSO_REAL_IT_APPROVAL_FILE||!env.KINNSO_REAL_IT_ATTESTATION_FILE)throw new Blocked('APPROVAL_REQUIRED');
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true}).trim();
 let approval,attestation;
 try{approval=JSON.parse(readFileSync(env.KINNSO_REAL_IT_APPROVAL_FILE,'utf8'));attestation=JSON.parse(readFileSync(env.KINNSO_REAL_IT_ATTESTATION_FILE,'utf8'))}catch{throw new Blocked('APPROVAL_RECORD_UNREADABLE')}
 validatePublicApproval(approval,head,{env});
 const docker=args=>String(execFileSync('docker',args,{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024}));
 if(attestation.project!==target.project||attestation.runId!==approval.runId)throw new Blocked('ATTESTATION_SCOPE_MISMATCH');
 if(attestation.sourceArchiveSha256!==approval.sourceArchiveSha256||attestation.migrationManifestSha256!==approval.migrationManifestSha256)throw new Blocked('ATTESTATION_ARTIFACT_MISMATCH');
 const names=['db','kong','rest','auth','storage'].map(kind=>`supabase_${kind}_${target.project}`);
 let containers,network,volume;
 try{containers=JSON.parse(docker(['inspect',...names]));[network]=JSON.parse(docker(['network','inspect',target.network]));[volume]=JSON.parse(docker(['volume','inspect',target.volume]))}catch{throw new Blocked('DOCKER_IDENTITY_UNAVAILABLE')}
 if(network.Name!==target.network||network.Id!==attestation.networkId||Object.keys(network.Containers??{}).length!==5)throw new Blocked('NETWORK_IDENTITY_MISMATCH');
 for(const kind of ['db','kong','rest','auth','storage']){
  const container=containers.find(value=>value.Name==='/supabase_'+kind+'_'+target.project);
  if(!container?.State?.Running||container.Id!==attestation.containerIds?.[kind]||container.Image!==attestation.imageIds?.[kind]||container.Config?.Labels?.['com.supabase.cli.project']!==target.project||container.Config?.Labels?.['com.docker.compose.project']!==target.project||Object.keys(container.NetworkSettings?.Networks??{}).length!==1||container.NetworkSettings.Networks[target.network]?.NetworkID!==network.Id)throw new Blocked('CONTAINER_IDENTITY_MISMATCH');
 }
 const db=containers.find(value=>value.Name==='/supabase_db_'+target.project),kong=containers.find(value=>value.Name==='/supabase_kong_'+target.project);
 if(!db.Mounts?.some(mount=>mount.Type==='volume'&&mount.Name===target.volume&&mount.Destination==='/var/lib/postgresql/data')||volume.Labels?.['com.supabase.cli.project']!==target.project)throw new Blocked('VOLUME_IDENTITY_MISMATCH');
 const owner=port=>docker(['ps','--no-trunc','--filter','publish='+port,'--format','{{.ID}}']).trim().split(/\r?\n/).filter(Boolean);
 if(JSON.stringify(owner(new URL(target.apiOrigin).port))!==JSON.stringify([kong.Id])||JSON.stringify(owner(target.dbPort))!==JSON.stringify([db.Id]))throw new Blocked('PORT_OWNER_MISMATCH');
 const appPort=new URL(target.appOrigin).port;
 const listeners=String(execFileSync('netstat',['-ano','-p','tcp'],{encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']})).split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts[0]==='TCP'&&parts[1]==='127.0.0.1:'+appPort&&parts[3]==='LISTENING');
 if(listeners.length!==1||Number(listeners[0][4])!==attestation.appPid)throw new Blocked('APP_PORT_OWNER_MISMATCH');
 const files=readdirSync(path.join(root,'supabase/migrations')).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
 const hashes=Object.fromEntries(files.map(name=>[name,sha(readFileSync(path.join(root,'supabase/migrations',name)))]));
 if(sha(JSON.stringify(hashes))!==approval.migrationManifestSha256)throw new Blocked('MIGRATION_SOURCE_DRIFT');
 const expectedVersions=files.map(name=>name.slice(0,14));
 let versions;
 try{versions=JSON.parse(docker(['exec',db.Id,'psql','-X','-q','-t','-A','--no-password','--username=postgres','--dbname=postgres','-c',"select coalesce(json_agg(version order by version),'[]'::json) from supabase_migrations.schema_migrations"]))}catch{throw new Blocked('LIVE_SCHEMA_QUERY_FAILED')}
 if(JSON.stringify(versions)!==JSON.stringify(expectedVersions))throw new Blocked('MIGRATION_SET_MISMATCH');
 let baseline;
 try{baseline=JSON.parse(docker(['exec',db.Id,'psql','-X','-q','-t','-A','--no-password','--username=postgres','--dbname=postgres','-c',"select json_build_object('guides',(select count(*) from public.guides),'experiences',(select count(*) from public.experiences),'sessions',(select count(*) from public.community_sessions),'articles',(select count(*) from public.articles),'guide_saves',(select count(*) from public.guide_saves))"]))}catch{throw new Blocked('BASELINE_QUERY_FAILED')}
 if(env.KINNSO_PUBLIC_IT_EXPECT_EMPTY==='1'&&Object.values(baseline).some(value=>value!==0))throw new Blocked('FIXTURE_BASELINE_NOT_EMPTY');
 const response=await fetch(target.appOrigin+'/source/kinnsoos-source.zip',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok||sha(Buffer.from(await response.arrayBuffer()))!==approval.sourceArchiveSha256)throw new Blocked('APP_SOURCE_MISMATCH');
 return{approval,target,head,identity:{networkId:network.Id,containerIds:Object.fromEntries(['db','kong','rest','auth','storage'].map((kind,index)=>[kind,containers[index].Id]))},baseline,migrations:files.length};
}

export {BaseBlocked,assertSafeLedger};
