import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {profileInput,timestamp} from '../../../../lib/merchants/onboarding-validation';
export async function GET(request:Request){const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;const q=new URL(request.url).searchParams,id=q.get('id');if(!uuid(id)||[...q.keys()].some(k=>k!=='id')||q.getAll('id').length!==1)return failure('INVALID',400);try{const r=await ctx.client.rpc('get_kinnso_merchant_profile',{p_merchant_id:id});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}}
export async function PUT(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 let args;try{const b=object(await boundedBody(request,16384),['merchantId','requestId','expectedUpdatedAt','input']);if(!uuid(b.merchantId)||!uuid(b.requestId)||!timestamp(b.expectedUpdatedAt))return failure('INVALID',400);args={p_merchant_id:b.merchantId,p_request_id:b.requestId,p_expected_updated_at:b.expectedUpdatedAt,p_input:profileInput(b.input)};}catch{return failure('INVALID',400);}
 try{const r=await ctx.client.rpc('save_kinnso_merchant_profile',args);return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}
}
