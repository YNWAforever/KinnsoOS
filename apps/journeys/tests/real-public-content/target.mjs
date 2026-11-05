import {freemem} from 'node:os';
import {statfsSync} from 'node:fs';
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

export {BaseBlocked,assertSafeLedger};
