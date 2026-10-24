import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstat,mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const targetPaths=['/etc/apt/apt-mirrors.txt','/etc/apt/sources.list','/etc/apt/sources.list.d/ubuntu.sources'];
const reason='CI_MIRROR_REQUIRES_OWNED_GITHUB_RUNNER';
export function assertCiRunner(platform,env){
 assert.equal(platform,'linux',reason);
 assert.equal(env.GITHUB_ACTIONS,'true',reason);
 assert.equal(env.KINNSO_CI_RUNNER_ENVIRONMENT,'github-hosted',reason);
 assert.equal(env.GITHUB_REPOSITORY?.toLowerCase(),'ynwaforever/kinnsoos',reason);
 for(const key of ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'])assert.match(env[key]??'',/^[1-9][0-9]*$/,reason);
 assert.match(env.GITHUB_SHA??'',/^[0-9a-f]{40}$/,reason);
}
export function ubuntuRelease(text){
 const fields=Object.fromEntries(text.split(/\r?\n/).flatMap(line=>{const m=line.match(/^([A-Z_]+)=(.*)$/);return m?[[m[1],m[2].replace(/^"(.*)"$/,'$1')]]:[];}));
 const codename={'22.04':'jammy','24.04':'noble'}[fields.VERSION_ID];
 assert.ok(fields.ID==='ubuntu'&&codename&&fields.VERSION_CODENAME===codename,'CI_MIRROR_UNSUPPORTED_UBUNTU_IMAGE');
 return{id:fields.ID,version:fields.VERSION_ID,codename};
}
export function replaceAzureMirror(text){
 // Preserve suites, components, signing options, comments and every other host.
 return text.split('\n').map(line=>{
  const comment=line.indexOf('#'),body=comment<0?line:line.slice(0,comment),tail=comment<0?'':line.slice(comment);
  return body.replace(/(^|\s)https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu(?=\/?(?:\s|$))/g,'$1https://archive.ubuntu.com/ubuntu')+tail;
 }).join('\n');
}
async function prepare(){
 assertCiRunner(process.platform,process.env);
 const distribution=ubuntuRelease(await readFile('/etc/os-release','utf8'));
 const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(sourceSha,process.env.GITHUB_SHA,'CI_MIRROR_SOURCE_MISMATCH');
 const digest=value=>createHash('sha256').update(value).digest('hex');
 const rows=[];
 // Finish the complete target preflight before any privileged file write.
 for(const file of targetPaths){
  let stat;try{stat=await lstat(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===0,'CI_MIRROR_TARGET_NOT_ROOT_REGULAR_FILE');
  assert.equal(await realpath(file),file,'CI_MIRROR_TARGET_ALIAS');
  const before=await readFile(file,'utf8'),after=replaceAzureMirror(before);
  rows.push({file,before,after,applied:false});
 }
 assert.ok(rows.length,'CI_MIRROR_UBUNTU_SOURCES_MISSING');
 const receipt={version:1,sourceSha,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
  environment:'owned GitHub-hosted Ubuntu runner only',distribution,status:'PREFLIGHT_COMPLETE',
  replacement:'Azure Ubuntu archive URI to official HTTPS Ubuntu archive; no suite/component/keyring/dependency changes',
  paths:rows.map(row=>({path:row.file,beforeSha256:digest(row.before),afterSha256:digest(row.after),changed:row.before!==row.after,applied:false}))};
 const out=path.resolve('evidence/ci/browser-mirror.json');await mkdir(path.dirname(out),{recursive:true});
 const save=()=>writeFile(out,JSON.stringify(receipt,null,2)+'\n');await save();
 try{
  for(const [index,row] of rows.entries()){
   if(row.before===row.after)continue;
   execFileSync('sudo',['-n','tee',row.file],{input:row.after,stdio:['pipe','ignore','pipe']});
   assert.equal(await readFile(row.file,'utf8'),row.after,'CI_MIRROR_WRITE_VERIFICATION_FAILED');
   row.applied=true;receipt.paths[index].applied=true;await save();
  }
  receipt.status=rows.some(row=>row.applied)?'APPLIED_OFFICIAL_MIRROR':'UNCHANGED_NO_AZURE_MIRROR';
 }catch(error){receipt.status='FAILED';receipt.failureType=error.name;throw error;}finally{await save();}
 console.log(JSON.stringify(receipt));
 // The original Playwright --with-deps installer is a separate required step.
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await prepare();}catch(error){console.error('CI browser mirror preflight failed: '+error.message);process.exitCode=1;}
}
