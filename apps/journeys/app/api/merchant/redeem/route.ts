import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
export async function POST(request:Request){const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 try{const b=object(await boundedBody(request,4096),['code','branchId','requestId','amountSpent']);if(!uuid(b.branchId)||!uuid(b.requestId)||typeof b.code!=='string'||!b.code.trim()||b.code.length>2048||(b.amountSpent!==null&&(typeof b.amountSpent!=='number'||!Number.isFinite(b.amountSpent)||b.amountSpent<0)))return failure('INVALID',400);
  const r=await ctx.client.rpc('redeem_kinnso_offer',{p_raw_token:b.code,p_branch_id:b.branchId,p_request_id:b.requestId,p_amount_spent:b.amountSpent});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return failure('INVALID',400);}}
