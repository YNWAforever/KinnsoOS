// Connection-free packet review. References are declarations, never verified authority.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifySourceInputs} from './verify-source-inputs.mjs';

const matrix = [
 ['traveller-a','traveller',null,null],['traveller-b','traveller',null,null],
 ['creator-a','creator',null,null],['creator-b','creator',null,null],
 ['a-owner','merchant','company-a','owner'],['a-marketing','merchant','company-a','marketing'],
 ['a-clerk','merchant','company-a','clerk'],['a-finance','merchant','company-a','finance'],
 ['b-owner','merchant','company-b','owner'],['b-marketing','merchant','company-b','marketing'],
 ['b-clerk','merchant','company-b','clerk'],['b-finance','merchant','company-b','finance'],
 ['outsider','outsider',null,null],['ops','ops',null,null]
];
export const actorAliases=Object.freeze(matrix.map(x=>x[0]));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const ref=x=>typeof x==='string'&&x.trim().length>0&&x===x.trim()&&x.length<=256;
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const project=x=>typeof x==='string'&&/^[a-z]{20}$/.test(x);
const selectedDecisions={D01:'KEEP_CURRENT_NOTICE',D02:'A',D03:'A',D04:'EXISTING_REMIX_KINNSO',D05:'A',D06:'A'};
function sensitive(value){
 const pending=[value],seen=new Set();let count=0;
 while(pending.length){
  if(++count>5000)return true;
  const item=pending.pop();
  if(typeof item==='string'&&/(?:postgres(?:ql)?:\/\/|sb_secret_|eyJ[A-Za-z0-9_-]+\.)/i.test(item))return true;
  if(!item||typeof item!=='object'||seen.has(item))continue;
  seen.add(item);
  for(const [key,v] of Object.entries(item)){
   if(/(?:password|passwd|secret|token|credential|private.?key|(?:api|service).*key)$/i.test(key)&&v!==null&&v!=='')return true;
   pending.push(v);
  }
 }
 return false;
}
function targetDeclaration(t,now){
 if(!object(t)||!ref(t.ownerRef)||!ref(t.managementRef)||!ref(t.transportRef)||t.managementRef===t.transportRef)return false;
 const age=now-Date.parse(t.observedAt);
 if(!Number.isFinite(age)||age < -1000||age>900000)return false;
 if(t.kind==='existing_shared_project')return project(t.projectRef)&&ref(t.cohortRef)&&t.apiOrigin===`https://${t.projectRef}.supabase.co`;
 if(t.kind==='owned_local')return /^kinnsoos-rehearsal-[a-f0-9]{12}$/.test(t.projectRef??'')&&t.apiOrigin==='http://127.0.0.1:59421'&&t.unlinked===true&&ref(t.ownershipMarkerRef);
 return false;
}
export function assessPilotPreparation(input,{sourceRevision,now=Date.now()}={}){
 const p=object(input)?input:{};const checks=[];
 const check=(id,ok)=>checks.push({id,status:ok?'PASS':'BLOCKED'});
 check('PACKET_FORMAT',p.version===1);
 check('NON_SECRET_PACKET',!sensitive(input));
 check('SOURCE_BINDING',sha(sourceRevision)&&p.sourceRevision===sourceRevision);
 for(let i=1;i<=6;i++){
  const id=`D${String(i).padStart(2,'0')}`;
  let ok=object(p.decisions?.[id])&&p.decisions[id].selection===selectedDecisions[id]&&ref(p.decisions[id].reference);
  if(id==='D04')ok=ok&&p.environmentOption==='existing_project_bounded_cohort'&&p.targets?.staging?.kind==='existing_shared_project';
  check(id,Boolean(ok));
 }
 // Selecting a direction is not evidence of operational ownership or service objectives.
 check('RECOVERY_PREPARATION',ref(p.recovery?.ownerRef)&&p.recovery?.serviceObjective==='NOT_PROMISED'&&p.recovery?.rpoMinutes===null&&p.recovery?.rtoMinutes===null);
 const a=p.targets?.staging,b=p.targets?.restore;
 const forbidden=p.forbiddenProjectRefs;
 check('DISTINCT_TARGETS',project(a?.projectRef)&&p.selectedExistingProjectRef===a.projectRef&&b?.kind==='owned_local'&&/^kinnsoos-rehearsal-[a-f0-9]{12}$/.test(b?.projectRef??'')&&a.projectRef!==b.projectRef&&Array.isArray(forbidden)&&forbidden.length>0&&forbidden.every(project)&&!forbidden.includes(a.projectRef)&&!forbidden.includes(b.projectRef));
 check('TARGET_IDENTITY',targetDeclaration(a,now)&&targetDeclaration(b,now));
 const actors=p.actors,companies=p.companies;
 const companyOK=Array.isArray(companies)&&companies.length===2&&companies.every(object)&&['company-a','company-b'].every(alias=>companies.some(c=>c.alias===alias&&ref(c.identityRef)))&&new Set(companies.map(c=>c.identityRef)).size===2;
 const actorOK=Array.isArray(actors)&&actors.length===matrix.length&&new Set(actors.map(a=>a?.identityRef)).size===matrix.length&&matrix.every(([alias,persona,company,membershipRole])=>actors.some(a=>object(a)&&a.alias===alias&&a.persona===persona&&a.company===company&&a.membershipRole===membershipRole&&ref(a.identityRef)));
 check('ACTOR_MATRIX',companyOK&&actorOK);
 check('SCOPE',p.scope?.realContent==='BLOCKED'&&p.scope?.schema==='not_checked'&&p.scope?.runtime==='NOT_RUN'&&p.scope?.cloudResetSeedCleanup==='FORBIDDEN'&&p.scope?.schemaChanges==='NOT_AUTHORIZED'&&p.scope?.opsGlobalGrant==='NOT_AUTHORIZED'&&p.scope?.restoreCoverage==='SYNTHETIC_SUBSET_ONLY'&&p.scope?.policyActivation==='NOT_AUTHORIZED'&&p.scope?.optionalProcessing==='NO_NEW'&&p.scope?.existingFourTaskAi==='UNCHANGED');
 const blocked=checks.some(c=>c.status==='BLOCKED');
 return {status:blocked?'BLOCKED_INPUTS':'REVIEWABLE_NOT_EXECUTABLE',evidenceLevel:'LOCAL_PACKET_VALIDATION_ONLY',sourceRevision:sha(sourceRevision)?sourceRevision:null,checks,schemaStatus:'not_checked',realContentStatus:'BLOCKED',runtimeStatus:'NOT_RUN',isolationStatus:'SHARED_BACKEND_NOT_ISOLATED_STAGING',fullRestoreStatus:'NOT_RUN',authorizedActions:[]};
}
export async function resolveCandidateRevision(root=fileURLToPath(new URL('../',import.meta.url))){
 let gitRevision=null,canonicalCheckout=false;
 try{
  const options={cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']};
  const top=execFileSync('git',['rev-parse','--show-toplevel'],options).trim();
  const canonical=x=>{const p=fs.realpathSync(x);return process.platform==='win32'?p.toLowerCase():p;};
  canonicalCheckout=canonical(path.join(top,'apps/journeys'))===canonical(root);
  if(canonicalCheckout){
   const revision=execFileSync('git',['rev-parse','HEAD'],options).trim();
   if(!sha(revision)||execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],options).trim())return null;
   if(execFileSync('git',['rev-parse','HEAD'],options).trim()!==revision)return null;
   gitRevision=revision;
  }
 }catch{if(canonicalCheckout)return null;}
 const metadata=path.join(root,'SOURCE_METADATA.json');
 // Metadata cannot mask a dirty canonical checkout or borrow an unrelated HEAD.
 if(fs.existsSync(metadata)){
  try{
   const p=JSON.parse(fs.readFileSync(metadata,'utf8'));
   if(p.version!==1||p.dirty!==false||!sha(p.sourceRevision)||(gitRevision!==null&&p.sourceRevision!==gitRevision))return null;
   await verifySourceInputs(root,p);
   if(gitRevision!==null){
    const options={cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']};
    if(execFileSync('git',['rev-parse','HEAD'],options).trim()!==gitRevision||execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],options).trim()||execFileSync('git',['rev-parse','HEAD'],options).trim()!==gitRevision)return null;
   }
   return p.sourceRevision;
  }catch{return null;}
 }
 return gitRevision;
}
async function main(args){
 try{
  if(args.length!==2||args[0]!=='--packet'||fs.statSync(args[1]).size>262144)throw Error();
  const packet=JSON.parse(fs.readFileSync(args[1],'utf8').replace(/^\uFEFF/,''));
  const report=assessPilotPreparation(packet,{sourceRevision:await resolveCandidateRevision()});
  console.log(JSON.stringify(report));process.exitCode=report.status==='BLOCKED_INPUTS'?2:0;
 }catch{console.log(JSON.stringify({status:'INVALID_PACKET',runtimeStatus:'NOT_RUN',authorizedActions:[]}));process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main(process.argv.slice(2));
