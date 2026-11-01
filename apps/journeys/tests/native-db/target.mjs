// No SDK, dotenv, network clients or import-time side effects.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const config=JSON.parse(readFileSync(new URL('./stack.config.json',import.meta.url),'utf8'));
const verified=new WeakMap();
const stages=new Set(['preflight','provision','migrate','run','cleanup-owned']);
const scopes=['new-local-stack','migrations','synthetic-fixtures','owned-fault-injection','owned-fixture-cleanup'];
const hash=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const resourceId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
export class Blocked extends Error {constructor(code){super(code);this.name='NativeAcceptanceBlocked';this.code=code;this.exitCode=78;}}
export function gate(ok,code){if(!ok)throw new Blocked(code);}
const sameSet=(a,b)=>Array.isArray(a)&&new Set(a).size===a.length&&a.length===b.length&&a.every(x=>b.includes(x));
const timestamp=s=>typeof s==='string'?Date.parse(s):NaN;
const fresh=(s,now)=>Number.isFinite(timestamp(s))&&timestamp(s)<=now&&now-timestamp(s)<=60000;
export const targetIdentityHash=target=>createHash('sha256').update(JSON.stringify({runId:target.runId,
  dbContainerId:target.dbContainerId,networkId:target.networkId,volumeId:target.volumeId,containerIds:target.containerIds,
  imageDigests:target.imageDigests})).digest('hex');

export function validatePlan(input,{now=Date.now()}={}){
 gate(input?.approved===true&&input.approvalSource==='user:NA01-NA09-local-only-20261101','APPROVAL_REQUIRED');
 gate(input.version===1&&uuid.test(input.runId??''),'PLAN_INVALID');
 gate(input.project===config.project&&input.apiOrigin===config.apiOrigin&&
  Object.keys(input.ports??{}).length===3&&Object.entries(config.ports).every(([key,value])=>input.ports[key]===value),'TARGET_NOT_APPROVED');
 gate(Number.isFinite(timestamp(input.createdAt))&&timestamp(input.createdAt)<=now&&timestamp(input.expiresAt)>now&&
  timestamp(input.expiresAt)-timestamp(input.createdAt)<=24*60*60*1000,'APPROVAL_EXPIRED');
 gate(hash.test(input.sourceHash??'')&&hash.test(input.migrationHash??''),'SOURCE_MANIFEST_REQUIRED');
 gate(Array.isArray(input.stages)&&input.stages.length>0&&input.stages.every(s=>stages.has(s)),'STAGE_NOT_APPROVED');
 gate(scopes.every(s=>input.scopes?.includes(s)),'SCOPE_MISSING');
 gate(input.minimumFreeMemoryBytes===config.minimumFreeMemoryBytes&&input.minimumFreeDiskBytes===config.minimumFreeDiskBytes,'RESOURCE_THRESHOLD_CHANGED');
 gate(input.cliVersion===config.cliVersion&&input.postgresMajor===config.postgresMajor,'TOOL_VERSION_CHANGED');
 // Copy to avoid validation followed by mutation of an input object.
 const plan=structuredClone(input);Object.freeze(plan.ports);Object.freeze(plan.stages);Object.freeze(plan.scopes);return Object.freeze(plan);
}
function validateObserved(plan,o,now){
 gate(fresh(o?.observedAt,now),'OBSERVATION_STALE');
 gate(o.sourceHash===plan.sourceHash,'SOURCE_DRIFT');gate(o.migrationHash===plan.migrationHash,'MIGRATION_DRIFT');
}
export function validatePreflight(input,o,{now=Date.now()}={}){
 const plan=validatePlan(input,{now});validateObserved(plan,o,now);
 gate(Number.isSafeInteger(o.freeMemoryBytes)&&o.freeMemoryBytes>=plan.minimumFreeMemoryBytes,'INSUFFICIENT_RAM');
 gate(o.dockerDisk?.verified===true,'DOCKER_DISK_UNVERIFIED');
 gate(Number.isSafeInteger(o.dockerDisk.freeBytes)&&o.dockerDisk.freeBytes>=plan.minimumFreeDiskBytes,'INSUFFICIENT_DISK');
 gate(o.cliVersion===plan.cliVersion,'CLI_UNAVAILABLE_OR_MISMATCH');
 gate(o.projectExists===false&&o.volumeExists===false&&o.networkExists===false,'TARGET_ALREADY_EXISTS');
 gate(Array.isArray(o.occupiedPorts)&&!o.occupiedPorts.some(p=>Object.values(plan.ports).includes(p)),'PORT_IN_USE');
 return Object.freeze({status:'PREFLIGHT_PASS',runId:plan.runId,observedAt:o.observedAt});
}
export function validateTopology(input,o,{now=Date.now()}={}){
 const plan=validatePlan(input,{now});validateObserved(plan,o,now);
 const receipt=o.launchReceipt;
 gate(receipt?.runId===plan.runId&&receipt.sourceHash===plan.sourceHash&&receipt.migrationHash===plan.migrationHash,'LAUNCH_RECEIPT_MISMATCH');
 gate([o.network?.id,o.volume?.id,receipt.networkId,receipt.volumeId].every(resourceId),'RESOURCE_ID_INVALID');
 const owned=resource=>{
  gate(resource?.labels?.project===plan.project&&(!resource.labels.runId||resource.labels.runId===plan.runId),'RESOURCE_OWNER_MISMATCH');
  gate(timestamp(resource.createdAt)>=timestamp(plan.createdAt)&&timestamp(resource.createdAt)<=now,'RESOURCE_PREDATES_RUN');
 };
 owned(o.network);owned(o.volume);
 gate(o.network.internal===true&&o.network.id===receipt.networkId,'NETWORK_NOT_ISOLATED');
 gate(o.volume.id===receipt.volumeId,'VOLUME_MISMATCH');
 gate(Array.isArray(o.containers)&&o.containers.length===4,'CONTAINER_SET_MISMATCH');
 const roles=['db','auth','rest','gateway'];gate(sameSet(o.containers.map(c=>c.role),roles),'CONTAINER_SET_MISMATCH');
 const ids=o.containers.map(c=>c.id);
 gate(ids.every(resourceId)&&sameSet(ids,receipt.containerIds)&&sameSet(o.network.containers,ids),'CONTAINER_SET_MISMATCH');
 for(const c of o.containers){
  owned(c);gate(c.running===true&&sameSet(c.networks,[o.network.id]),'CONTAINER_NETWORK_MISMATCH');
  gate(/^sha256:[a-f0-9]{64}$/.test(c.imageDigest??'')&&c.imageDigest===receipt.imageDigests?.[c.role],'IMAGE_MISMATCH');
  const expectedPorts=c.role==='db'?[{hostIp:'127.0.0.1',hostPort:plan.ports.db,containerPort:5432}]:c.role==='gateway'?[{hostIp:'127.0.0.1',hostPort:plan.ports.api,containerPort:8000}]:[];
  gate(Array.isArray(c.ports)&&c.ports.length===expectedPorts.length&&expectedPorts.every(e=>c.ports.some(p=>Object.keys(e).every(k=>e[k]===p[k]))),'PORT_BINDING_MISMATCH');
  gate(Array.isArray(c.mounts),'MOUNT_MISMATCH');
  // Minimal harness topology: only the database may have a data volume. Gateway
  // config must be attested separately before a concrete provisioner is enabled.
  gate(c.role==='db'?c.mounts.length===1&&c.mounts[0].type==='volume'&&c.mounts[0].source===o.volume.id&&c.mounts[0].destination==='/var/lib/postgresql/data':c.mounts.length===0,'MOUNT_MISMATCH');
 }
 const byRole=Object.fromEntries(o.containers.map(c=>[c.role,c]));
 gate(['auth','rest'].every(role=>byRole[role].upstream?.dbContainerId===byRole.db.id&&byRole[role].upstream.database==='postgres'),'DB_UPSTREAM_MISMATCH');
 gate(byRole.gateway.routes?.authContainerId===byRole.auth.id&&byRole.gateway.routes?.restContainerId===byRole.rest.id,'GATEWAY_UPSTREAM_MISMATCH');
 return Object.freeze({runId:plan.runId,project:plan.project,apiOrigin:plan.apiOrigin,dbContainerId:byRole.db.id,
  networkId:o.network.id,volumeId:o.volume.id,imageDigests:Object.freeze({...receipt.imageDigests}),
  containerIds:Object.freeze([...receipt.containerIds]),
  sourceHash:plan.sourceHash,migrationHash:plan.migrationHash,attestedAt:o.observedAt});
}
export async function attestTarget(input,stage,{now,probe}={}){
 const plan=validatePlan(input,{now:now??Date.now()});gate(plan.stages.includes(stage),'STAGE_NOT_APPROVED');
 gate(typeof probe==='function','LIVE_ATTESTOR_NOT_IMPLEMENTED');
 const observation=await probe(stage,plan);
 const checkedAt=now??Date.now();
 if(stage==='preflight'||stage==='provision')return validatePreflight(plan,observation,{now:checkedAt});
 const target=validateTopology(plan,observation,{now:checkedAt});verified.set(target,{stage,expiresAt:Math.min(timestamp(plan.expiresAt),timestamp(target.attestedAt)+60000)});return target;
}
export function requireVerifiedTarget(target,stage,{now=Date.now()}={}){
 const receipt=verified.get(target);gate(receipt,'UNATTESTED_TARGET');gate(receipt.stage===stage,'TARGET_STAGE_MISMATCH');
 gate(now<receipt.expiresAt,'TARGET_ATTESTATION_EXPIRED');return target;
}
