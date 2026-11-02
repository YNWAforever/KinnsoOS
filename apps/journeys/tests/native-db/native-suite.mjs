import {gate} from './target.mjs';
import {summarizeCases} from './results.mjs';

const now=()=>new Date().toISOString();
function sanitized(error){
  return /^[A-Z0-9_]{1,100}$/.test(error?.code??'')?error.code:'CASE_FAILED';
}
export async function runNativeCases({manifest,context,handlers,cleanup=async()=>{},additional=[],evidenceWriter}){
  gate(typeof cleanup==='function','CLEANUP_ADAPTER_INVALID');
  const results=[],startedAt=now();
  try{
    for(const item of manifest.cases){
      const handler=handlers.get(item.id),caseStarted=now();
      if(!handler){
        results.push({id:item.id,status:'BLOCKED',evidenceLevel:item.evidenceLevel,runId:context.runId,sourceHash:context.sourceHash,
          startedAt:caseStarted,endedAt:now(),reason:'HANDLER_NOT_IMPLEMENTED',expected:item.expected,actual:'Not executed',evidenceFiles:[]});
        continue;
      }
      try{
        const outcome=await handler();
        gate(typeof evidenceWriter==='function','EVIDENCE_WRITER_REQUIRED');
        const evidenceFile=await evidenceWriter({id:item.id,evidenceLevel:item.evidenceLevel,runId:context.runId,
          sourceHash:context.sourceHash,targetReceiptHash:context.targetReceiptHash,schemaReceiptHash:context.schemaReceiptHash,
          outcome,startedAt:caseStarted,endedAt:now()});
        gate(typeof evidenceFile==='string'&&evidenceFile.length>0,'CASE_EVIDENCE_NOT_WRITTEN');
        results.push({id:item.id,status:'PASS',evidenceLevel:item.evidenceLevel,runId:context.runId,sourceHash:context.sourceHash,
          targetReceiptHash:context.targetReceiptHash,schemaReceiptHash:context.schemaReceiptHash,startedAt:caseStarted,endedAt:now(),
          expected:item.expected,actual:typeof outcome?.actual==='string'?outcome.actual:'Observed',evidenceFiles:[evidenceFile]});
      }catch(error){
        results.push({id:item.id,status:'FAIL',evidenceLevel:item.evidenceLevel,runId:context.runId,sourceHash:context.sourceHash,
          startedAt:caseStarted,endedAt:now(),reason:sanitized(error),expected:item.expected,actual:'Case failed',evidenceFiles:[]});
      }
    }
  }finally{
    try{await cleanup();context.cleanupStatus='PASS';}catch{context.cleanupStatus='FAIL';}
  }
  const all=[...results,...additional];
  const summary=summarizeCases(manifest,all,{...context,cleanupStatus:context.cleanupStatus});
  return Object.freeze({startedAt,endedAt:now(),cleanupStatus:context.cleanupStatus,cases:Object.freeze(results),summary});
}
