// Registry-only preparation: never starts, resets, seeds or retries a database.
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const cliVersion='2.107.0';
const verifiedImages=JSON.parse(fs.readFileSync(new URL('./ci-image-lock.json',import.meta.url),'utf8'));
const publishers={postgres:'supabase/postgres',kong:'library/kong',postgrest:'postgrest/postgrest',gotrue:'supabase/gotrue',realtime:'supabase/realtime','storage-api':'supabase/storage-api',imgproxy:'darthsim/imgproxy','edge-runtime':'supabase/edge-runtime',mailpit:'axllent/mailpit','postgres-meta':'supabase/postgres-meta'};
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
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.RUNNER_OS!=='Linux'||env.RUNNER_ARCH!=='X64'||!env.RUNNER_TEMP||!env.DOCKER_CONFIG||!path.isAbsolute(env.RUNNER_TEMP)||path.resolve(env.DOCKER_CONFIG)!==path.resolve(env.RUNNER_TEMP,'kinnso-ghcr'))throw Error('CI_REGISTRY_CONTEXT_REQUIRED');
}
function validatedLock(lock){
 const expected=new Set([...imagePlan('root'),...imagePlan('mailbox')].map(x=>x.image));
 const digest=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
 if(lock?.version!==1||lock.cliVersion!==cliVersion||lock.platform!=='linux/amd64'||lock.sourceInventoryGitBlob!=='cf5906e8face5a550d4361dcc67840f6e2989dc2'||!Array.isArray(lock.images)||lock.images.length!==expected.size)throw Error('VERIFIED_IMAGE_LOCK_REQUIRED');
 const entries=new Map();
 for(const row of lock.images){
  const name=row?.image?.match(/^ghcr\.io\/supabase\/([a-z-]+):/)?.[1];
  if(!expected.has(row?.image)||entries.has(row.image)||row.platform!=='linux/amd64'||!digest(row.digest)||!digest(row.primaryIndexDigest)||!digest(row.mirrorIndexDigest)||row.mirror!=='docker.io/'+publishers[name])throw Error('VERIFIED_IMAGE_LOCK_REQUIRED');
  entries.set(row.image,row);
 }
 return entries;
}
function retryablePull(result,message){
 // Authentication, missing images and an unavailable daemon cannot recover via a registry mirror.
 if(/unauthorized|forbidden|denied|manifest unknown|cannot connect to the docker daemon|\b40[13]\b/i.test(message))return false;
 // Local process setup failures are not hung registry downloads.
 if(['ENOENT','EACCES','ENOEXEC','EINVAL','ENOBUFS'].includes(result.error?.code))return false;
 return Boolean(result.status===null||result.error||result.signal||/toomanyrequests|\b429\b|timeout|timed[ -]?out|awaiting headers|request cancel(?:ed|led)|dial tcp|connection (?:refused|reset|closed|aborted)|temporary failure|\beof\b|net\/http|context deadline|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network is unreachable|no such host/i.test(message));
}
export async function prefetchCiImages(profile,{env=process.env,run=spawnSync,wait=pause,clock=Date.now,random=Math.random,log=console.log,lock=verifiedImages}={}){
 const plan=imagePlan(profile);requireContext(env);const locks=validatedLock(lock);
 const receipt={status:'IN_PROGRESS',profile,cliVersion,sourceRevision:/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')?env.GITHUB_SHA:null,images:[]};
 let failedImage;
 const deadline=clock()+480000;
 const execute=(program,args)=>{
  const remaining=deadline-clock();if(remaining<=0)throw Error('REGISTRY_TIME_BUDGET_EXHAUSTED');
  return run(program,args,{env,encoding:'utf8',timeout:Math.min(120000,remaining),maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
 };
 try{
  const version=execute('supabase',['--version']);
  if(version.status!==0||version.error||version.stdout?.trim()!==cliVersion)throw Error('PINNED_CLI_VERSION_REQUIRED');
  for(const {image,alias} of plan){
   const pin=locks.get(image),primary=image.slice(0,image.lastIndexOf(':'));
   let attempts=0,source='GHCR',reference=primary+'@'+pin.digest;
   for(;;){
    attempts++;log(`Pinned image ${image}, attempt ${attempts}/5`);
    failedImage={image,attempts,source,downloadReference:reference,lockedDigest:pin.digest};
    const result=execute('docker',['pull','--platform','linux/amd64',reference]);
    if(result.status===0&&!result.error)break;
    const message=String(result.stderr??'')+'\n'+String(result.stdout??'')+'\n'+String(result.error?.message??'');
    failedImage.lastError=message.slice(-2000);log(failedImage.lastError);
    if(!retryablePull(result,message))throw Error('IMAGE_PULL_FAILED');
    if(attempts===5)throw Error('REGISTRY_RETRY_EXHAUSTED');
    const delay=[15000,30000,60000,60000][attempts-1]+Math.floor(random()*5001);
    if(clock()+delay>=deadline)throw Error('REGISTRY_TIME_BUDGET_EXHAUSTED');
    if(source==='GHCR'){source='VERIFIED_DOCKER_HUB';reference=pin.mirror+'@'+pin.digest;}
    log(`Transient registry pull failure; wait ${delay}ms before acquiring the same locked digest via ${source}`);await wait(delay);
   }
   const inspection=execute('docker',['image','inspect',reference,'--format','{{json .RepoDigests}}']);
   let digests=[];try{digests=JSON.parse(inspection.stdout);}catch{}
   const canonical=x=>x.replace(/^(?:docker\.io|index\.docker\.io|registry-1\.docker\.io)\//,'').replace(/^library\//,'');
   const matches=d=>typeof d==='string'&&(d===reference||(source==='VERIFIED_DOCKER_HUB'&&canonical(d)===canonical(reference)));
   if(inspection.status!==0||inspection.error||!Array.isArray(digests)||!digests.some(matches))throw Error('IMAGE_DIGEST_REQUIRED');
   receipt.images.push({image,attempts,source,downloadReference:reference,lockedDigest:pin.digest,digests:digests.filter(matches)});
   failedImage=undefined;
   for(const tag of [image,...(alias?[alias]:[])]){const tagged=execute('docker',['tag',reference,tag]);if(tagged.status!==0||tagged.error)throw Error('LOCAL_IMAGE_ALIAS_FAILED');}
  }
  receipt.status='PASS';return receipt;
 }catch(error){error.receipt={...receipt,status:'FAIL',reason:error.message,...(failedImage?{failedImage}:{})};throw error;}
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
