import path from 'node:path';
import {Blocked,gate} from './target.mjs';

export function parseDockerDisk(output){
  const lines=String(output??'').trim().split(/\r?\n/),header=lines.findIndex(line=>/^Filesystem\s+1024-blocks/.test(line));
  gate(header>=0&&lines[header+1],'DOCKER_DISK_INVALID');
  const parts=lines[header+1].trim().split(/\s+/);
  gate(parts.length>=6&&parts.slice(1,4).every(value=>/^\d+$/.test(value))&&parts.at(-1).startsWith('/'),'DOCKER_DISK_INVALID');
  const multiplier=1024;
  return Object.freeze({source:parts[0],totalBytes:Number(parts[1])*multiplier,usedBytes:Number(parts[2])*multiplier,
    availableBytes:Number(parts[3])*multiplier,mount:parts.at(-1)});
}
export function validateDockerDiskMount(disk,engineRoot){
  gate(engineRoot==='/var/lib/docker'&&disk?.mount===engineRoot,'DOCKER_DISK_INVALID');
  gate(Number.isSafeInteger(disk.availableBytes)&&disk.availableBytes>=0,'DOCKER_DISK_INVALID');
  return Object.freeze({verified:true,freeBytes:disk.availableBytes,availableBytes:disk.availableBytes,
    totalBytes:disk.totalBytes,mount:disk.mount,source:disk.source,engineRoot});
}

function replaceSectionValue(source,section,key,value){
  const lines=source.split(/\r?\n/),start=lines.findIndex(line=>line.trim()===`[${section}]`);
  gate(start>=0,`CONFIG_SECTION_MISSING:${section}:${key}`);
  let end=lines.findIndex((line,index)=>index>start&&/^\s*\[[^\]]+\]\s*$/.test(line));
  if(end<0)end=lines.length;
  const target=lines.findIndex((line,index)=>index>start&&index<end&&new RegExp(`^\\s*${key}\\s*=`).test(line));
  gate(target>=0,`CONFIG_SECTION_MISSING:${section}:${key}`);
  lines[target]=`${key} = ${value}`;
  return lines.join('\n');
}

export function createIsolatedConfig(source,{project,apiOrigin,ports}){
  gate(typeof source==='string'&&/^project_id\s*=/m.test(source),'CONFIG_SOURCE_INVALID');
  gate(/^[a-z0-9-]{8,80}$/.test(project??'')&&apiOrigin===`http://127.0.0.1:${ports?.api}`,'CONFIG_TARGET_INVALID');
  let config=source.replace(/^project_id\s*=\s*"[^"]+"/m,`project_id = "${project}"`);
  config=replaceSectionValue(config,'api','port',ports.api);
  config=replaceSectionValue(config,'db','port',ports.db);
  config=replaceSectionValue(config,'db','shadow_port',ports.shadow);
  config=replaceSectionValue(config,'db.seed','enabled','false');
  for(const section of ['realtime','studio','inbucket','storage'])config=replaceSectionValue(config,section,'enabled','false');
  config=replaceSectionValue(config,'auth','site_url',`"${apiOrigin}"`);
  // Do not inherit a hosted or arbitrary OpenAI/provider setting from the shared config.
  config=config.replace(/^\s*openai_api_key\s*=.*$/gm,'openai_api_key = ""');
  return config;
}

export function validateLocalCredentials(input,expectedApiOrigin){
  let api,db;
  try{api=new URL(input?.API_URL);db=new URL(input?.DB_URL);}catch{throw new Blocked('LOCAL_CREDENTIALS_INVALID');}
  gate(api.origin===expectedApiOrigin&&api.pathname==='/'&&!api.username&&!api.password&&!api.search&&!api.hash,'LOCAL_CREDENTIALS_INVALID');
  gate(['postgres:','postgresql:'].includes(db.protocol)&&db.hostname==='127.0.0.1'&&['60022'].includes(db.port)&&db.pathname==='/postgres'&&!db.search&&!db.hash,'LOCAL_CREDENTIALS_INVALID');
  gate(typeof input.ANON_KEY==='string'&&input.ANON_KEY.length>=40&&typeof input.SERVICE_ROLE_KEY==='string'&&input.SERVICE_ROLE_KEY.length>=40&&input.ANON_KEY!==input.SERVICE_ROLE_KEY,'LOCAL_CREDENTIALS_INVALID');
  return Object.freeze({apiUrl:api.origin,dbPort:db.port});
}

export function createReplayPlan(manifest){
  const files=manifest?.files;
  gate(Array.isArray(files)&&files.length>0,'MIGRATION_MANIFEST_INVALID');
  for(let index=0;index<files.length;index++){
    const file=files[index];
    gate(/^\d{14}_[a-z0-9_]+\.sql$/.test(file?.name??'')&&file.name.slice(0,14)===file.version&&/^[a-f0-9]{64}$/.test(file.sha256??''),'MIGRATION_MANIFEST_INVALID');
    if(index)gate(file.version>files[index-1].version,'MIGRATION_ORDER_INVALID');
  }
  return Object.freeze(files.map(file=>Object.freeze({...file})));
}

export function ownedRunDirectory(root,runId){
  gate(/^[a-f0-9-]{36}$/.test(runId??''),'RUN_ID_INVALID');
  const base=path.resolve(root,'.local-private/native-acceptance'),target=path.join(base,runId);
  gate(target.startsWith(base+path.sep)&&path.resolve(target)===target,'OWNED_PATH_INVALID');
  return target;
}
