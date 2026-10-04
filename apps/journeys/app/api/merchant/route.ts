import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
export async function GET(request:Request){const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;
 const q=new URL(request.url).searchParams,id=q.get('id'),after=q.get('after'),applicationsAfter=q.get('applicationsAfter'),outcomesAfter=q.get('outcomesAfter');if([id,after,applicationsAfter,outcomesAfter].some(value=>value&&!uuid(value)))return failure('INVALID',400);
 const r=id?await ctx.client.rpc('get_kinnso_merchant_workspace',{p_merchant_id:id,p_after:after,p_application_after:applicationsAfter,p_outcome_after:outcomesAfter}):await ctx.client.rpc('get_kinnso_merchant_memberships');return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}
export async function POST(request:Request){const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 try{const b=object(await boundedBody(request,65536),['merchantId','requestId','command']);if(!uuid(b.merchantId)||!uuid(b.requestId))return failure('INVALID',400);
  const command=object(b.command,['type','id','name','userId','role','branchIds','active','title','summary','couponCode','couponUrl','affiliateRate','kinnsoRate','creatorRate','publish','requirements','deliverables','expectedStatus','action','note','reason']);
  const r=await ctx.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:b.merchantId,p_request_id:b.requestId,p_command:command});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return failure('INVALID',400);}}
