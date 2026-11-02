import {spawn} from 'node:child_process';
import {probeDockerDisk} from './disk-proof.mjs';
import {Blocked,gate,attestTarget} from './target.mjs';

export const engineHost='npipe:////./pipe/dockerDesktopLinuxEngine';
export function commandEnvironment(parent){
  const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','COMSPEC','PATHEXT']);
  return Object.fromEntries(Object.entries(parent).filter(([key])=>allowed.has(key.toUpperCase())));
}
export async function run(file,args,{input,env,timeout=30000}={}){
  return await new Promise((resolve,reject)=>{
    const child=spawn(file,args,{env:env??commandEnvironment(process.env),windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
    const stdout=[],stderr=[];let bytes=0,timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
    const collect=target=>chunk=>{
      bytes+=chunk.byteLength;
      if(bytes>16*1024*1024){child.kill();return;}
      target.push(chunk);
    };
    child.stdout.on('data',collect(stdout));child.stderr.on('data',collect(stderr));
    child.on('error',error=>{clearTimeout(timer);const blocked=new Blocked('LOCAL_COMMAND_FAILED');blocked.command=file;blocked.exitCode=null;blocked.causeCode=error.code;reject(blocked);});
    child.on('close',code=>{
      clearTimeout(timer);const out=Buffer.concat(stdout),err=Buffer.concat(stderr);
      if(code===0&&!timedOut&&bytes<=16*1024*1024)return resolve({stdout:out.toString('utf8'),stderr:err.toString('utf8'),code});
      const blocked=new Blocked(timedOut?'LOCAL_COMMAND_TIMEOUT':'LOCAL_COMMAND_FAILED');
      blocked.command=file;blocked.exitCode=code;blocked.stderr=err.toString('utf8').slice(0,12000);
      const sqlState=/^(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/m.exec(blocked.stderr)?.[1];
      if(sqlState)blocked.sqlState=sqlState;reject(blocked);
    });
    if(input!==undefined)child.stdin.end(input);else child.stdin.end();
  });
}
export const docker=async args=>{
  const result=await run('docker',['--host',engineHost,...args]);
  return result.stdout.trim();
};
export function containerNames(project){
  return Object.fromEntries(Object.entries({db:'db',auth:'auth',rest:'rest',gateway:'kong'})
    .map(([role,kind])=>[role,`supabase_${kind}_${project}`]));
}
function projectLabel(inspect){
  const labels=inspect?.Config?.Labels??{};
  return labels['com.supabase.cli.project']??labels['com.supabase.project']??labels['com.docker.compose.project']??null;
}
function parsePorts(networkSettings){
  const result=[];
  for(const [containerPort,bindings] of Object.entries(networkSettings?.Ports??{})){
    for(const binding of bindings??[])result.push({hostIp:binding.HostIp,hostPort:Number(binding.HostPort),containerPort:Number(containerPort.split('/')[0])});
  }
  return result;
}
function databaseName(value){
  let url;
  try{url=new URL(value);}catch{return null;}
  gate(['postgres:','postgresql:'].includes(url.protocol)&&url.pathname==='/postgres'&&!url.search&&!url.hash,'DB_UPSTREAM_INVALID');
  return {host:url.hostname,port:url.port||'5432',database:'postgres'};
}
export function kongRoutes(config,project){
  const services=config.split(/^ {2}- name: /m).slice(1).map(block=>({
    urls:[...block.matchAll(/^ {4}url: (\S+)\s*$/gm)].map(match=>match[1]),
    paths:[...block.matchAll(/^ {10}- (\S+)\s*$/gm)].map(match=>match[1])
  }));
  const find=prefix=>services.filter(service=>service.paths.some(path=>path===prefix));
  const auth=find('/auth/v1/'),rest=find('/rest/v1/');
  gate(auth.length===1&&rest.length===1,'GATEWAY_ROUTE_INVALID');
  const upstream=url=>{const parsed=new URL(url);return parsed;};
  const authUrl=upstream(auth[0].urls[0]),restUrl=upstream(rest[0].urls[0]);
  gate(authUrl.origin===`http://supabase_auth_${project}:9999`&&restUrl.origin===`http://supabase_rest_${project}:3000`,'GATEWAY_UPSTREAM_MISMATCH');
  return {authService:authUrl.origin,restService:restUrl.origin};
}
export function normalizeTopology({plan,containers,network,volume,kongConfig}){
  const names=containerNames(plan.project),byName=Object.fromEntries(containers.map(row=>[row.Name.replace(/^\//,''),row]));
  const normalized=[];
  for(const [role,name] of Object.entries(names)){
    const row=byName[name];
    gate(row?.State?.Running===true&&/^[a-f0-9]{64}$/.test(row.Id??''),'CONTAINER_IDENTITY_MISMATCH');
    gate(projectLabel(row)===plan.project,'CONTAINER_OWNER_MISMATCH');
    gate(row.Image?.startsWith('sha256:'),'IMAGE_MISMATCH');
    const networks=Object.values(row.NetworkSettings?.Networks??{});
    gate(networks.length===1&&networks[0].NetworkID===network.Id,'CONTAINER_NETWORK_MISMATCH');
    normalized.push({id:row.Id,role,name:row.Name.replace(/^\//,''),imageDigest:row.Image,networks:[network.Id],
      labels:{project:projectLabel(row),...(row.Config?.Labels?.['org.kinnso.na.run']?{runId:row.Config.Labels['org.kinnso.na.run']}:{})},
      createdAt:row.Created,running:true,ports:parsePorts(row.NetworkSettings),
      mounts:(row.Mounts??[]).map(mount=>({type:mount.Type,source:mount.Name??mount.Source,destination:mount.Destination})),
      upstream:role==='auth'||role==='rest'?databaseName(row.Config?.Env?.find(item=>item.startsWith(role==='auth'?'GOTRUE_DB_DATABASE_URL=':'PGRST_DB_URI='))?.split('=').slice(1).join('=')):undefined,
      routes:role==='gateway'?{authContainerId:byName[names.auth]?.Id,restContainerId:byName[names.rest]?.Id}:undefined});
  }
  const db=normalized.find(row=>row.role==='db'),auth=normalized.find(row=>row.role==='auth'),rest=normalized.find(row=>row.role==='rest');
  gate(auth.upstream?.host===names.db&&rest.upstream?.host===names.db,'DB_UPSTREAM_MISMATCH');
  auth.upstream={dbContainerId:db.id,database:auth.upstream.database};
  rest.upstream={dbContainerId:db.id,database:rest.upstream.database};
  const launchReceipt={runId:plan.runId,createdAt:plan.createdAt,sourceHash:plan.sourceHash,migrationHash:plan.migrationHash,
    networkId:network.Id,volumeId:volume.Name??volume.Id,containerIds:normalized.map(row=>row.id),
    imageDigests:Object.fromEntries(normalized.map(row=>[row.role,row.imageDigest]))};
  return {
    observedAt:new Date().toISOString(),sourceHash:plan.sourceHash,migrationHash:plan.migrationHash,
    network:{id:network.Id,internal:network.Internal===true,labels:{project:network.Labels?.['org.kinnso.na.project']??network.Labels?.['com.docker.compose.project'],
      runId:network.Labels?.['org.kinnso.na.run']},createdAt:network.Created,containers:Object.keys(network.Containers??{})},
    volume:{id:volume.Name??volume.Id,labels:{project:volume.Labels?.['com.supabase.cli.project']??volume.Labels?.['org.kinnso.na.project'],
      runId:volume.Labels?.['org.kinnso.na.run']},createdAt:volume.CreatedAt},
    containers:normalized,launchReceipt,gateway:kongRoutes(kongConfig,plan.project)
  };
}
export async function collectTopology(plan){
  const names=Object.values(containerNames(plan.project)),networkName=`supabase_network_${plan.project}`,volumeName=`supabase_db_${plan.project}`;
  const [containers,network,volume,kongConfig]=await Promise.all([
    docker(['inspect',...names]).then(JSON.parse),
    docker(['network','inspect',networkName]).then(JSON.parse).then(rows=>rows[0]),
    docker(['volume','inspect',volumeName]).then(JSON.parse).then(rows=>rows[0]),
    docker(['exec',containerNames(plan.project).gateway,'cat','/home/kong/kong.yml'])
  ]);
  return normalizeTopology({plan,containers,network,volume,kongConfig});
}
export async function attestLiveTopology(plan,stage='migrate'){
  const attestationStage=stage==='provision'?'migrate':stage;
  return attestTarget(plan,attestationStage,{probe:()=>collectTopology(plan)});
}
export async function dockerDisk(){
  const [root,operatingSystem]=await Promise.all([
    docker(['info','--format','{{.DockerRootDir}}']),
    docker(['info','--format','{{.OperatingSystem}}'])
  ]);
  gate(root==='/var/lib/docker'&&operatingSystem==='Docker Desktop','DOCKER_ENGINE_IDENTITY_INVALID');
  return probeDockerDisk({engineRoot:root,operatingSystem,
    command:async(file,args)=>(await run(file,args)).stdout});
}
