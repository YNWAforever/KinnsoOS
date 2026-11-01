const statuses=new Set(['PASS','FAIL','BLOCKED','NOT_RUN','SKIP']);
const levels=new Set(['L0','L1','L2','L3']);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function summarizeCases(manifest,results,context={}){
 const cases=manifest?.cases??[],counts={PASS:0,FAIL:0,BLOCKED:0,NOT_RUN:0,SKIP:0};const issues=[];
 const byId=new Map(cases.map(c=>[c.id,c])),seen=new Set();
 if(!Array.isArray(results)||!cases.length||byId.size!==cases.length||!cases.some(c=>c.required))return {status:'INVALID_EVIDENCE',counts,issues:['EMPTY_OR_INVALID_CATALOG']};
 for(const r of results){
  const c=byId.get(r.id);
  if(!c||seen.has(r.id)||!statuses.has(r.status)){issues.push('UNKNOWN_DUPLICATE_OR_INVALID_RESULT');continue;}
  seen.add(r.id);counts[r.status]++;
  if(r.status!=='PASS')continue;
  if(c.implemented!==true||!levels.has(c.evidenceLevel)||r.evidenceLevel!==c.evidenceLevel||
   !nonempty(r.expected)||!nonempty(r.actual)||!Array.isArray(r.evidenceFiles)||!r.evidenceFiles.length||
   !r.evidenceFiles.every(nonempty)||!Number.isFinite(Date.parse(r.startedAt))||!Number.isFinite(Date.parse(r.endedAt))||Date.parse(r.endedAt)<Date.parse(r.startedAt)||
   !nonempty(context.runId)||r.runId!==context.runId||!digest(context.sourceHash)||r.sourceHash!==context.sourceHash){issues.push('CASE_EVIDENCE_INVALID');continue;}
  if(['L1','L2'].includes(c.evidenceLevel)&&(!digest(context.targetReceiptHash)||r.targetReceiptHash!==context.targetReceiptHash||
   !digest(context.schemaReceiptHash)||r.schemaReceiptHash!==context.schemaReceiptHash))issues.push('NATIVE_RECEIPTS_MISSING_OR_MISMATCH');
 }
 const missing=cases.filter(c=>c.required&&!seen.has(c.id)).map(c=>c.id);
 const requiredIncomplete=results.some(r=>byId.get(r.id)?.required&&['SKIP','NOT_RUN'].includes(r.status));
 const status=issues.length?'INVALID_EVIDENCE':counts.FAIL?'FAIL':context.cleanupStatus!=='PASS'||counts.BLOCKED?'BLOCKED':manifest.expanded!==true||missing.length||requiredIncomplete?'INCOMPLETE':
  cases.some(c=>c.required&&['L1','L2'].includes(c.evidenceLevel))?'LOCAL_NATIVE_DB_ACCEPTANCE_PASS':'OFFLINE_ONLY_PASS';
 return {status,counts,missing,issues,limitations:['REAL_MCP_NOT_RUN','RIGHTS_NOT_VERIFIED','CONNECTED_APP_HTTP_NOT_RUN','HOSTED_NOT_RUN']};
}
export function makeBlockedResults(manifest,reason,context={}){
 const at=new Date().toISOString();return manifest.cases.map(c=>({id:c.id,status:'BLOCKED',evidenceLevel:c.evidenceLevel,runId:context.runId??null,
  sourceHash:context.sourceHash??null,startedAt:at,endedAt:at,reason,expected:c.expected??'See approved plan',actual:'Not executed',evidenceFiles:[]}));
}
