import {createHash} from 'node:crypto';

// Keep raw Auth/browser output in memory. Evidence contains only counts,
// fixed diagnostic codes and a fingerprint of the original transcript.
const safeCodes=[
 'RESOURCE_GATE_FREE_RAM_BELOW_3_GIB','RESOURCE_GATE_FREE_RAM_BELOW_2_GIB','RESOURCE_GATE_READING_INVALID','APPROVED_RAM_THRESHOLD_MISMATCH',
 'BLOCKED_APPROVAL_REQUIRED','BLOCKED_APPROVAL_RECORD_UNREADABLE',
 'BLOCKED_EVIDENCE_DIRECTORY_REQUIRED','APPROVAL_EXPIRED_OR_INVALID',
 'SOURCE_DRIFT','ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND',
 'ERR_UNKNOWN_FILE_EXTENSION','EACCES','EPERM','ENOMEM','ENOENT',
];
export function summarizeRealRun(result,{productHead,project,testSelection='FULL_EXISTING_8'}){
 const transcript=String(result.stdout??'')+'\n'+String(result.stderr??'');
 const counters=[...transcript.matchAll(/\b(\d+) (passed|failed|skipped)\b/g)]
  .map(match=>({kind:match[2],count:Number(match[1])}));
 for(const match of transcript.matchAll(/\b(\d+) did not run\b/g))
  counters.push({kind:'not-run',count:Number(match[1])});
 const failures=[...transcript.matchAll(/REAL_IT_FAILURE ([A-Za-z0-9_]{1,80}) ([A-Z0-9_]{1,40})/g)]
  .map(match=>({stage:match[1],code:match[2]}));
 const hasCaseResults=counters.some(row=>['passed','failed'].includes(row.kind)&&row.count>0);
 const knownCode=safeCodes.find(code=>result.error?.code===code||new RegExp('\\b'+code+'\\b').test(transcript));
 const sample=transcript.match(/\bRESOURCE_GATE_(FREE_RAM_BELOW_([23])_GIB|READING_INVALID) freeBytes=(null|\d+) minimumBytes=(\d+) readingValid=(true|false)\b/);
 let resourceGate=null;
 if(sample&&[2*1024**3,3*1024**3].includes(Number(sample[4]))&&
  (!sample[2]||Number(sample[2])*1024**3===Number(sample[4]))){
  const readingValid=sample[5]==='true',freeBytes=sample[3]==='null'?null:Number(sample[3]);
  if(readingValid&&Number.isFinite(freeBytes)&&freeBytes>0||!readingValid&&freeBytes===null)
   resourceGate={readingValid,freeBytes,minimumBytes:Number(sample[4])};
 }
 const expectedCaseCount=testSelection==='TRAVELLER_CORE_12'?12:testSelection==='STALE_TAB_4'?4:testSelection==='FULL_EXISTING_8'?8:
  ['en/desktop','en/mobile','zh-HK/desktop','zh-HK/mobile'].includes(testSelection)?3:
  ['en/','zh-HK/'].includes(testSelection)?6:null;
 const passed=counters.filter(row=>row.kind==='passed');
 const complete=expectedCaseCount!==null&&passed.length===1&&passed[0].count===expectedCaseCount&&
  !counters.some(row=>row.kind!=='passed'&&row.count>0);
 let status;
 if(hasCaseResults)
  status=result.status!==0||counters.some(row=>row.kind==='failed'&&row.count>0)?'FAIL_REAL_TARGET':
   complete?'PASS_REAL_TARGET':'INCOMPLETE_REAL_TARGET';
 else status=knownCode?'BLOCKED_BEFORE_CASE_RESULTS':'INCONCLUSIVE_NO_CASE_RESULTS';
 return {productHead,project,testSelection,expectedCaseCount,status,
  exitCode:status==='PASS_REAL_TARGET'?0:Number.isInteger(result.status)&&result.status!==0?result.status:78,
  childExitCode:result.status??null,counters,failures,
  preCaseCode:hasCaseResults?null:knownCode??'UNCLASSIFIED',resourceGate,
  transcriptSha256:createHash('sha256').update(transcript).digest('hex')};
}
