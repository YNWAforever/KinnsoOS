import { apiContext, backendFailure, boundedBody, failure, reply } from '../../../../lib/api/server';
import { object, uuid } from '../../../../lib/api/validation';
export async function POST(request:Request){const ctx=await apiContext(request,'ops',true);if(ctx.response)return ctx.response;
 try{const b=object(await boundedBody(request,16384),['ids','jobId','action','reasonCategory','reason','requestId']);let r;
  if(b.ids!==undefined){if(Object.keys(b).length!==1||!Array.isArray(b.ids)||b.ids.length<1||b.ids.length>100||!b.ids.every(uuid))return failure('INVALID',400);r=await ctx.client.rpc('preview_kinnso_review_bulk',{p_ids:b.ids});}
  else{if(!uuid(b.jobId)||!uuid(b.requestId)||!['approve','reject','request_revision'].includes(String(b.action))||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>2000||(b.reasonCategory!==null&&typeof b.reasonCategory!=='string'))return failure('INVALID',400);
   r=await ctx.client.rpc('run_kinnso_review_bulk',{p_job_id:b.jobId,p_request_id:b.requestId,p_action:b.action,p_reason_category:b.reasonCategory,p_reason:b.reason});}
  return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return failure('INVALID',400);}}
