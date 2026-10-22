// Registry-only preparation: never starts, resets, seeds or retries a database.
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const cliVersion='2.107.0';
// Exact CLI2.107.0 service tags: apps/cli-go/pkg/config/templates/Dockerfile.
// Studio/analytics/pooler are disabled in the existing owned CI profiles.
const base=['postgres:17.6.1.136','kong:2.8.1','postgrest:v14.13','gotrue:v2.190.0','realtime:v2.107.5','storage-api:v1.60.20','imgproxy:v3.8.0','edge-runtime:v1.74.1'];
export function imagePlan(profile){
 if(!['connected','mailbox','root'].includes(profile))throw Error('INVALID_IMAGE_PROFILE');
 const images=base.map(name=>({image:'ghcr.io/supabase/'+name}));
 if(profile==='mailbox')images.push({image:'ghcr.io/supabase/mailpit:v1.22.3'});
 if(profile==='root')images.push({image:'ghcr.io/supabase/postgres-meta:v0.96.1',alias:'public.ecr.aws/supabase/postgres-meta:v0.96.1'});
 return images;
}
function requireContext(env){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||!env.RUNNER_TEMP||!env.DOCKER_CONFIG||!path.isAbsolute(env.RUNNER_TEMP)||path.resolve(env.DOCKER_CONFIG)!==path.resolve(env.RUNNER_TEMP,'kinnso-ghcr'))throw Error('CI_REGISTRY_CONTEXT_REQUIRED');
}
export async function prefetchCiImages(profile,{env=process.env,run=spawnSync,wait=pause,clock=Date.now,random=Math.random,log=console.log}={}){
 const plan=imagePlan(profile);requireContext(env);
 const receipt={status:'IN_PROGRESS',profile,cliVersion,sourceRevision:/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')?env.GITHUB_SHA:null,images:[]};
 const deadline=clock()+480000;
 const execute=(program,args)=>{
  const remaining=deadline-clock();if(remaining<=0)throw Error('REGISTRY_TIME_BUDGET_EXHAUSTED');
  return run(program,args,{env,encoding:'utf8',timeout:Math.min(120000,remaining),maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
 };
 try{
  const version=execute('supabase',['--version']);
  if(version.status!==0||version.error||version.stdout?.trim()!==cliVersion)throw Error('PINNED_CLI_VERSION_REQUIRED');
  for(const {image,alias} of plan){
   let attempts=0;
   for(;;){
    attempts++;log(`Pinned image ${image}, attempt ${attempts}/5`);
    const result=execute('docker',['pull',image]);
    if(result.status===0&&!result.error)break;
    const message=String(result.stderr??'')+'\n'+String(result.stdout??'');
    log(message.slice(-2000));
    if(result.status===null||result.error||result.signal||!/toomanyrequests|\b429\b/i.test(message))throw Error('IMAGE_PULL_FAILED');
    if(attempts===5)throw Error('REGISTRY_RETRY_EXHAUSTED');
    const delay=[15000,30000,60000,60000][attempts-1]+Math.floor(random()*5001);
    if(clock()+delay>=deadline)throw Error('REGISTRY_TIME_BUDGET_EXHAUSTED');
    log(`Registry throttled; wait ${delay}ms before retrying the same image only`);await wait(delay);
   }
   const inspection=execute('docker',['image','inspect',image,'--format','{{json .RepoDigests}}']);
   let digests=[];try{digests=JSON.parse(inspection.stdout);}catch{}
   const repository=image.slice(0,image.lastIndexOf(':'));
   if(inspection.status!==0||inspection.error||!Array.isArray(digests)||!digests.some(d=>typeof d==='string'&&d.startsWith(repository+'@sha256:')&&/^[a-f0-9]{64}$/.test(d.slice((repository+'@sha256:').length))))throw Error('IMAGE_DIGEST_REQUIRED');
   receipt.images.push({image,attempts,digests:digests.filter(d=>typeof d==='string'&&d.startsWith(repository+'@sha256:')&&/^[a-f0-9]{64}$/.test(d.slice((repository+'@sha256:').length)))});
   if(alias){const tagged=execute('docker',['tag',image,alias]);if(tagged.status!==0||tagged.error)throw Error('LOCAL_IMAGE_ALIAS_FAILED');}
  }
  receipt.status='PASS';return receipt;
 }catch(error){error.receipt={...receipt,status:'FAIL',reason:error.message};throw error;}
}
async function main(args){
 let receipt;
 try{
  if(args.length!==2||args[0]!=='--profile'||!['connected','mailbox','root'].includes(args[1]))throw Error('INVALID_IMAGE_PROFILE');
  receipt=await prefetchCiImages(args[1]);
 }catch(error){receipt=error.receipt??{status:'FAIL',reason:error.message};process.exitCode=1;}
 if(process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'){
  const target=fileURLToPath(new URL('../evidence/ci/image-downloads.json',import.meta.url));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n');
 }
 console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main(process.argv.slice(2));
