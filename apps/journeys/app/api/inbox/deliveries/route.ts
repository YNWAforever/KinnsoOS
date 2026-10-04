import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
export async function GET(request:Request){const ctx=await apiContext(request,'notifications');if(ctx.response)return ctx.response;const after=new URL(request.url).searchParams.get('after');if(after&&!uuid(after))return failure('INVALID',400);const r=await ctx.client.rpc('get_kinnso_delivery_failures',{p_after:after});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}
export async function POST(request:Request){const ctx=await apiContext(request,'notifications',true);if(ctx.response)return ctx.response;
 try{const b=object(await boundedBody(request,4000),['requestId','id','expectedRevision','reason']);if(!uuid(b.requestId)||!uuid(b.id)||typeof b.expectedRevision!=='number'||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1||typeof b.reason!=='string'||b.reason.trim().length<10||b.reason.length>2000)return failure('INVALID',400);
  const r=await ctx.client.rpc('retry_kinnso_notification_delivery',{p_request_id:b.requestId,p_id:b.id,p_expected_revision:b.expectedRevision,p_reason:b.reason});return r.error?.message==='delivery_not_found'?failure('NOT_FOUND',404):r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return failure('INVALID',400);}
}
