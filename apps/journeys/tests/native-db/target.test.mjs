import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan, validatePreflight, validateTopology, attestTarget, requireVerifiedTarget, Blocked} from './target.mjs';

const now=Date.parse('2026-11-01T06:00:00Z');
const hash='a'.repeat(64), runId='ccf501de-c366-49cf-a790-3b517f029514';
export function validPlan(){return {version:1,approved:true,approvalSource:'user:NA01-NA09-local-only-20261101',runId,
 project:'kinnsoos-native-acceptance-20261101',apiOrigin:'http://127.0.0.1:60021',ports:{api:60021,db:60022,shadow:60020},
 createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),sourceHash:hash,migrationHash:hash,
 stages:['preflight','provision','migrate','run','cleanup-owned'],scopes:['new-local-stack','migrations','synthetic-fixtures','owned-fault-injection','owned-fixture-cleanup'],
 minimumFreeMemoryBytes:4*1024**3,minimumFreeDiskBytes:10*1024**3,cliVersion:'2.107.0',postgresMajor:17};}
export function healthy(){return {observedAt:new Date(now).toISOString(),freeMemoryBytes:5*1024**3,dockerDisk:{verified:true,freeBytes:11*1024**3},
 cliVersion:'2.107.0',sourceHash:hash,migrationHash:hash,projectExists:false,volumeExists:false,networkExists:false,occupiedPorts:[]};}
export function topology(){const createdAt=new Date(now-500).toISOString();return {observedAt:new Date(now).toISOString(),sourceHash:hash,migrationHash:hash,
 network:{id:'net1',internal:true,labels:{runId,project:validPlan().project},createdAt,containers:['db1','auth1','rest1','gateway1']},
 volume:{id:'vol1',labels:{runId,project:validPlan().project},createdAt},
 containers:[
  {id:'db1',role:'db',name:'db',imageDigest:'sha256:'+hash,networks:['net1'],mounts:[{type:'volume',source:'vol1',destination:'/var/lib/postgresql/data'}],ports:[{hostIp:'127.0.0.1',hostPort:60022,containerPort:5432}]},
  {id:'auth1',role:'auth',name:'auth',imageDigest:'sha256:'+hash,networks:['net1'],mounts:[],ports:[],upstream:{dbContainerId:'db1',database:'postgres'}},
  {id:'rest1',role:'rest',name:'rest',imageDigest:'sha256:'+hash,networks:['net1'],mounts:[],ports:[],upstream:{dbContainerId:'db1',database:'postgres'}},
  {id:'gateway1',role:'gateway',name:'gateway',imageDigest:'sha256:'+hash,networks:['net1'],mounts:[],ports:[{hostIp:'127.0.0.1',hostPort:60021,containerPort:8000}],routes:{authContainerId:'auth1',restContainerId:'rest1'}},
 ].map(c=>({...c,createdAt,labels:{runId,project:validPlan().project},running:true})),
 launchReceipt:{runId,createdAt,sourceHash:hash,migrationHash:hash,networkId:'net1',volumeId:'vol1',containerIds:['db1','auth1','rest1','gateway1'],imageDigests:{db:'sha256:'+hash,auth:'sha256:'+hash,rest:'sha256:'+hash,gateway:'sha256:'+hash}}};}
const rejects=(fn,code)=>assert.throws(fn,e=>e instanceof Blocked&&e.code===code);
test('noApprovalCreatesNoClient',async()=>{let calls=0;await assert.rejects(attestTarget({...validPlan(),approved:false},'run',{now,probe:async()=>{calls++;}}),{code:'APPROVAL_REQUIRED'});assert.equal(calls,0);});
test('port3499Rejected',()=>rejects(()=>validatePlan({...validPlan(),ports:{api:3499,db:60022,shadow:60020}},{now}),'TARGET_NOT_APPROVED'));
test('foreign origin, expired approval and weaker resource thresholds are rejected',()=>{
 rejects(()=>validatePlan({...validPlan(),apiOrigin:'http://localhost:60021'},{now}),'TARGET_NOT_APPROVED');
 rejects(()=>validatePlan({...validPlan(),expiresAt:new Date(now).toISOString()},{now}),'APPROVAL_EXPIRED');
 rejects(()=>validatePlan({...validPlan(),minimumFreeMemoryBytes:2*1024**3},{now}),'RESOURCE_THRESHOLD_CHANGED');
});
test('missing scope and unapproved stage fail before probe',async()=>{let calls=0;const probe=async()=>{calls++;};await assert.rejects(attestTarget({...validPlan(),scopes:[]},'run',{now,probe}),{code:'SCOPE_MISSING'});await assert.rejects(attestTarget({...validPlan(),stages:['preflight']},'run',{now,probe}),{code:'STAGE_NOT_APPROVED'});assert.equal(calls,0);});
test('sourceDriftRejected',()=>rejects(()=>validatePreflight(validPlan(),{...healthy(),sourceHash:'b'.repeat(64)},{now}),'SOURCE_DRIFT'));
test('resources and Docker disk identity are mandatory',()=>{
 rejects(()=>validatePreflight(validPlan(),{...healthy(),freeMemoryBytes:1},{now}),'INSUFFICIENT_RAM');
 rejects(()=>validatePreflight(validPlan(),{...healthy(),dockerDisk:{verified:false,freeBytes:99*1024**3}},{now}),'DOCKER_DISK_UNVERIFIED');
 rejects(()=>validatePreflight(validPlan(),{...healthy(),dockerDisk:{verified:true,freeBytes:1}},{now}),'INSUFFICIENT_DISK');
});
test('existing target or occupied reserved port cannot be taken over',()=>{for(const field of ['projectExists','volumeExists','networkExists'])rejects(()=>validatePreflight(validPlan(),{...healthy(),[field]:true},{now}),'TARGET_ALREADY_EXISTS');rejects(()=>validatePreflight(validPlan(),{...healthy(),occupiedPorts:[60021]},{now}),'PORT_IN_USE');});
test('foreignGatewayRejected',()=>{const t=topology();t.containers[3].routes.restContainerId='foreign';rejects(()=>validateTopology(validPlan(),t,{now}),'GATEWAY_UPSTREAM_MISMATCH');});
test('reusedVolumeRejected',()=>{const t=topology();t.volume.createdAt=new Date(now-60000).toISOString();rejects(()=>validateTopology(validPlan(),t,{now}),'RESOURCE_PREDATES_RUN');});
test('missing or empty resource identities cannot be branded as an attested target',async()=>{
 for(const id of [undefined,null,'',' ']){const t=topology();t.network.id=id;t.volume.id=id;t.launchReceipt.networkId=id;t.launchReceipt.volumeId=id;
  for(const c of t.containers)c.networks=[id];t.containers[0].mounts[0].source=id;
  await assert.rejects(attestTarget(validPlan(),'run',{now,probe:async()=>t}),{code:'RESOURCE_ID_INVALID'});
 }
});
test('gateway ancestry verifies DB, mount, network and every port',()=>{
 for(const mutate of [t=>t.containers[1].upstream.dbContainerId='foreign',t=>t.containers[0].mounts[0].source='old-volume',t=>t.network.internal=false,t=>t.containers[2].networks.push('outside'),t=>t.containers[3].ports[0].hostIp='0.0.0.0',t=>t.containers[1].ports.push({hostIp:'127.0.0.1',hostPort:3499,containerPort:9999}),t=>t.network.containers.push('foreign')]){const t=topology();mutate(t);assert.throws(()=>validateTopology(validPlan(),t,{now}),Blocked);}
});
test('fresh receipts, exact images and resource membership are checked',()=>{for(const mutate of [t=>t.observedAt=new Date(now-61000).toISOString(),t=>t.containers[0].imageDigest='sha256:'+'b'.repeat(64),t=>t.launchReceipt.containerIds.pop(),t=>t.containers[2].labels.runId='other']){const t=topology();mutate(t);assert.throws(()=>validateTopology(validPlan(),t,{now}),Blocked);}});
test('runCannotProvisionOrMigrate and target objects cannot be forged',async()=>{
 const actions=[];const target=await attestTarget(validPlan(),'run',{now,probe:async stage=>{actions.push(stage);return topology();}});
 assert.deepEqual(actions,['run']);assert.equal(requireVerifiedTarget(target,'run',{now}).dbContainerId,'db1');
 assert.throws(()=>requireVerifiedTarget({...target},'run'),{code:'UNATTESTED_TARGET'});
 assert.throws(()=>requireVerifiedTarget(target,'migrate'),{code:'TARGET_STAGE_MISMATCH'});
 assert(Object.isFrozen(target));
});
test('observation produced after an asynchronous probe is not mistaken for future evidence',async()=>{
 const started=Date.now(),p={...validPlan(),createdAt:new Date(started-1000).toISOString(),expiresAt:new Date(started+3600000).toISOString()};
 const r=await attestTarget(p,'preflight',{probe:async()=>{await new Promise(resolve=>setTimeout(resolve,20));return {...healthy(),observedAt:new Date().toISOString()};}});
 assert.equal(r.status,'PREFLIGHT_PASS');
});
