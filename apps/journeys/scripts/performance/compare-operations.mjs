import {createHash} from 'node:crypto';
import {assessRun} from './report.mjs';
import {summarizeFirstUsable,firstUsableTasks} from './first-usable.mjs';
export function normalizeSchemaDump(value){return value.replace(/^\\(?:un)?restrict [A-Za-z0-9_]+\r?$/gm,'');}
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const revision=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
const median=values=>{const s=[...values].sort((a,b)=>a-b);return(s[2]+s[3])/2;};
export function compareOperationsBatch({protocol,runs}={}){
 const blockers=[],groups=[],sourceRefs=[];
 const incomparable=reason=>blockers.push(reason);
 if(protocol?.schemaVersion!==1||JSON.stringify(protocol.order)!==JSON.stringify(['A1','B1','B2','A2'])||protocol?.nonRegression?.absoluteMs!==50||protocol?.nonRegression?.relative!==0.05)incomparable('PROTOCOL_NOT_FROZEN_ABBA');
 if(!Array.isArray(runs)||JSON.stringify(runs.map(x=>x?.id))!==JSON.stringify(['A1','B1','B2','A2']))incomparable('REQUIRED_ORDER_OR_RUNS_MISSING');
 if(['conditionsHash','toolHash','instrumentationHash','hostHash','targetHash'].some(k=>!hash(protocol?.[k])))incomparable('PROTOCOL_HASHES_MISSING');
 if(blockers.length)return{status:'INCOMPARABLE',blockers,groups,sourceRefs};
 let candidateRejected=false;const refs={};
 for(const run of runs){
  const side=run.id[0],r=run.report,s=run.sidecar;
  sourceRefs.push({id:run.id,sourceSha:run.sourceSha,sourceTree:run.sourceTree});
  if(!revision(run.sourceSha)||!revision(run.sourceTree)||r?.sourceSha!==run.sourceSha||r?.sourceTree!==run.sourceTree||s?.sourceSha!==run.sourceSha||s?.sourceTree!==run.sourceTree)incomparable('SOURCE_BINDING_MISMATCH');
  if(refs[side]&&(refs[side].sourceSha!==run.sourceSha||refs[side].sourceTree!==run.sourceTree))incomparable('SIDE_SOURCE_DRIFT');refs[side]={sourceSha:run.sourceSha,sourceTree:run.sourceTree};
  if(side==='A'&&(run.sourceSha!==protocol.baseline?.sourceSha||run.sourceTree!==protocol.baseline?.sourceTree))incomparable('BASELINE_SOURCE_CHANGED');
  if(['conditionsHash','toolHash','instrumentationHash','hostHash','targetHash'].some(k=>run[k]!==protocol[k])||s?.conditionsHash!==protocol.conditionsHash)incomparable('HOST_TOOL_INSTRUMENTATION_CONDITIONS_DRIFT');
  const target=s?.provenance?.target;if(!target||target.environment!=='owned isolated local'||target.apiOrigin!=='http://127.0.0.1:58421'||target.dbContainer!=='supabase_db_'+target.project||!hash(target.schemaFingerprint)||s?.provenance?.targetHash!==protocol.targetHash||createHash('sha256').update(JSON.stringify(target)).digest('hex')!==protocol.targetHash)incomparable('ACTUAL_TARGET_OR_SCHEMA_DRIFT');
  const c=r?.conditions,screen=c?.screenEmulation,t=c?.throttling;
  if(c?.formFactor!=='mobile'||c?.throttlingMethod!=='devtools'||screen?.width!==390||screen?.height!==844||screen?.mobile!==true||screen?.deviceScaleFactor!==1||screen?.disabled!==false||t?.requestLatencyMs!==150||t?.downloadThroughputKbps!==1600||t?.uploadThroughputKbps!==750||t?.cpuSlowdownMultiplier!==4)incomparable('MEASUREMENT_CONDITIONS_CHANGED');
  if(createHash('sha256').update(JSON.stringify(c??null)).digest('hex')!==protocol.conditionsHash)incomparable('ACTUAL_CONDITIONS_HASH_MISMATCH');
  if(JSON.stringify(c)!==JSON.stringify(runs[0].report?.conditions))incomparable('ACTUAL_REPORT_CONDITIONS_DRIFT');
  if(r?.kind!=='operations'||r.samples?.length!==48||r.interactions?.length!==8||r.queryLatency?.samples?.length!==24||r.sourceDiff?.length!==0||!Array.isArray(r.sourceDiff))incomparable('ORIGINAL_COLLECTION_INCOMPLETE');
  if(JSON.stringify(r?.dataset)!==JSON.stringify(runs[0].report?.dataset))incomparable('ACTUAL_DATASET_DRIFT');
  if(r?.dataset?.campaigns<55||r?.dataset?.acceptedCreatorWork<55||r?.dataset?.reviewSubmissions<1)incomparable('DATASET_INCOMPLETE');
  if(!Array.isArray(s?.samples)||s.samples.length!==18)incomparable('SIDECAR_INCOMPLETE');
  try{const assessment=assessRun(r);if(assessment.status==='INCOMPLETE'||assessment.status!==r.assessment?.status)incomparable('UNVERIFIED_OR_FORGED_ASSESSMENT');if(side==='B'&&assessment.status!=='PASS')candidateRejected=true;}catch{incomparable('REPORT_INVALID');}
  const usable=summarizeFirstUsable(s?.samples,{sourceSha:s?.sourceSha,sourceTree:s?.sourceTree,conditionsHash:s?.conditionsHash,cleanup:s?.cleanup});
  if(usable.status!=='PASS'||r?.cleanup!=='PASS_OWNED_SYNTHETIC_ACTORS_REMOVED')candidateRejected=true;
 }
 if(blockers.length)return{status:'INCOMPARABLE',blockers:[...new Set(blockers)],groups,sourceRefs};
 for(const task of firstUsableTasks)for(const cache of ['cold','warm']){
  const values=side=>runs.filter(r=>r.id.startsWith(side)).flatMap(r=>r.sidecar.samples.filter(s=>s.task===task&&s.cache===cache).map(s=>s.acceptedInputMs));
  const a=values('A'),b=values('B');if(a.length!==6||b.length!==6||[...a,...b].some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0)){candidateRejected=true;groups.push({task,cache,status:'INCOMPLETE'});continue;}
  const aMedianMs=median(a),bMedianMs=median(b),limitMs=aMedianMs+Math.max(50,0.05*aMedianMs),status=bMedianMs<=limitMs?'PASS':'REGRESSION';if(status!=='PASS')candidateRejected=true;
  groups.push({task,cache,aSamples:a.length,bSamples:b.length,aMedianMs,bMedianMs,limitMs,status});
 }
 return{status:candidateRejected?'REJECTED':'PASS',blockers:candidateRejected?['CANDIDATE_NUMERIC_INPUT_OR_CLEANUP_NOT_ACCEPTED']:[],groups,sourceRefs};
}
