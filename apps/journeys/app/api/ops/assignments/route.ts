import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
export async function POST(request:Request){const ctx=await apiContext(request,'ops',true);if(ctx.response)return ctx.response;
 let rpcStarted=false;
 try{const b=object(await boundedBody(request,8192),['submissionId','memberId','expectedRevision','reason','requestId']);
  if(!uuid(b.submissionId)||!uuid(b.requestId)||(b.memberId!==null&&!uuid(b.memberId))||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0||Number(b.expectedRevision)>=2147483647||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>2000)return failure('INVALID',400);
  rpcStarted=true;const r=await ctx.client.rpc('set_kinnso_review_assignment',{p_submission_id:b.submissionId,p_member_id:b.memberId,p_expected_revision:b.expectedRevision,p_reason:b.reason,p_request_id:b.requestId});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return rpcStarted?failure('UNAVAILABLE',503):failure('INVALID',400);}
}
