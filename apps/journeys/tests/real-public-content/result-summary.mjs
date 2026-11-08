import{assertSafePublicEvidence,classifyPublicRun}from './target.mjs';
export function summarizePublicRun(result,context={}){
 const status=classifyPublicRun(result),output=String(result?.stdout??''),match=output.match(/\b(\d+)\s+passed\b/);
 return assertSafePublicEvidence({status,exitCode:status==='PASS_REAL_TARGET'?0:1,productHead:context.productHead,project:context.project,testSelection:'PUBLIC_CONTENT_8',expectedCaseCount:8,counters:match?[{kind:'passed',count:Number(match[1])}]:[]});
}
