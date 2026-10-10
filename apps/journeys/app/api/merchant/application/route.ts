import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {applicationInput} from '../../../../lib/merchants/onboarding-validation';
export async function GET(request:Request){const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;if(new URL(request.url).search)return failure('INVALID',400);try{const r=await ctx.client.rpc('get_kinnso_merchant_onboarding');return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}}
export async function POST(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 let args;try{const b=object(await boundedBody(request,16384),['requestId','input']);if(!uuid(b.requestId))return failure('INVALID',400);args={p_request_id:b.requestId,p_input:applicationInput(b.input)};}catch{return failure('INVALID',400);}
 try{const r=await ctx.client.rpc('submit_kinnso_merchant_application',args);return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}
}
