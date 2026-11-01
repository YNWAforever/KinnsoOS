import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,lstat} from 'node:fs/promises';
import {freemem} from 'node:os';
import {createRequire} from 'node:module';
import path from 'node:path';
import {buildMigrationManifest,sha256} from './migrations.mjs';
import {probeDockerDisk} from './disk-proof.mjs';
const exec=promisify(execFile);
const command=async(file,args)=>{const r=await exec(file,args,{timeout:12000,maxBuffer:4*1024*1024,windowsHide:true,env:cliEnvironment(process.env)});return r.stdout.trim();};
export function cliEnvironment(parent){
 const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','COMSPEC','PATHEXT']);
 return {...Object.fromEntries(Object.entries(parent).filter(([k])=>allowed.has(k.toUpperCase()))),SUPABASE_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1'};
}
export function parseCliVersion(result){return result.exitCode===0&&result.stdout.trim()==='2.107.0'?'2.107.0':null;}
async function executableCliVersion(root){
 const common=await command('git',['-C',root,'rev-parse','--git-common-dir']);
 const originalRoot=path.dirname(path.resolve(root,common));
 // Resolve only an already installed package in this checkout or its main
 // worktree. No npx, download, login, global binary or credential file lookup.
 for(const candidate of [root,originalRoot]){
  let entry;try{const req=createRequire(path.join(candidate,'package.json'));const pkg=req.resolve('supabase/package.json');
   const meta=JSON.parse(await readFile(pkg,'utf8'));if(meta.version!=='2.107.0')continue;entry=path.join(path.dirname(pkg),'dist/supabase.js');
  }catch{continue;}
  const result=await exec(process.execPath,[entry,'--version'],{timeout:12000,maxBuffer:32768,windowsHide:true,env:cliEnvironment(process.env)});
  return parseCliVersion({exitCode:0,stdout:result.stdout});
 }
 return null;
}
export async function sourceManifest(root){
 const raw=await command('git',['-C',root,'ls-files','-c','-o','--exclude-standard','-z']);
 const names=[...new Set(raw.split('\0').filter(n=>/^(apps\/|packages\/|scripts\/|supabase\/|docs\/prototypes\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|turbo\.json$)/.test(n)))].sort();
 const files=[];for(const name of names){const file=path.join(root,name);let stat;try{stat=await lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(stat.isSymbolicLink())throw Error('SOURCE_SYMLINK_UNSUPPORTED');if(stat.isFile())files.push({path:name,sha256:sha256(await readFile(file))});}
 return {hash:sha256(JSON.stringify(files)),files};
}
export async function collectPreflight(root,plan){
 const errors=[],safe=async(name,fn)=>{try{return await fn();}catch{errors.push(name);return null;}};
 const [source,migrations]=await Promise.all([sourceManifest(root),buildMigrationManifest(root)]);
 // Never inherit DOCKER_HOST/DOCKER_CONTEXT; only the local Desktop Linux pipe.
 const docker=args=>command('docker',['--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args]);
 const [containers,volumes,networks,ports,version,cliVersion,dockerRoot,operatingSystem]=await Promise.all([
  safe('DOCKER_CONTAINERS_UNAVAILABLE',()=>docker(['ps','-a','--filter','name='+plan.project,'--format','{{.Names}}'])),
  safe('DOCKER_VOLUMES_UNAVAILABLE',()=>docker(['volume','ls','--filter','name='+plan.project,'--format','{{.Name}}'])),
  safe('DOCKER_NETWORKS_UNAVAILABLE',()=>docker(['network','ls','--filter','name='+plan.project,'--format','{{.Name}}'])),
  safe('PORT_INVENTORY_UNAVAILABLE',()=>command('netstat',['-ano','-p','tcp'])),
  safe('DOCKER_VERSION_UNAVAILABLE',()=>docker(['version','--format','{{.Server.Version}}'])),
  safe('CLI_UNAVAILABLE_OR_MISMATCH',()=>executableCliVersion(root)),
  safe('DOCKER_ROOT_UNAVAILABLE',()=>docker(['info','--format','{{.DockerRootDir}}'])),
  safe('DOCKER_OS_UNAVAILABLE',()=>docker(['info','--format','{{.OperatingSystem}}']))
 ]);
 const diskObservation=await safe('DOCKER_DISK_UNAVAILABLE',()=>probeDockerDisk({engineRoot:dockerRoot,operatingSystem,command}));
 const occupiedPorts=ports===null?Object.values(plan.ports):[...new Set(ports.split(/\r?\n/).map(x=>x.trim().split(/\s+/)).filter(x=>x[0]==='TCP'&&x[3]==='LISTENING').map(x=>Number(x[1].split(':').at(-1))))];
 let dockerDisk={verified:false,freeBytes:null,reason:'BACKING_DISK_NOT_ATTESTED'};
 try{
  if(dockerRoot!=='/var/lib/docker'||operatingSystem!=='Docker Desktop')throw new Error('identity');
  if(!diskObservation)throw Error('Disk proof unavailable');
  dockerDisk=diskObservation;
 }catch{errors.push('DOCKER_DISK_UNVERIFIED');}
 return {observedAt:new Date().toISOString(),sourceHash:source.hash,migrationHash:migrations.hash,freeMemoryBytes:freemem(),
  cliVersion,cliStatus:cliVersion?'EXECUTABLE_VERSION_VERIFIED':'EXECUTION_UNVERIFIED',dockerVersion:version,
  dockerDisk,
  projectExists:containers===null?null:containers.length>0,volumeExists:volumes===null?null:volumes.length>0,
  networkExists:networks===null?null:networks.length>0,occupiedPorts,errors};
}
