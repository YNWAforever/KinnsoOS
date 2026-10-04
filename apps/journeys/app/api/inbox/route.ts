import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {successEvent} from '../../../lib/telemetry/server';
import {recentVerifiedOutcome} from '../../../lib/telemetry/outcomes';
import {object,uuid} from '../../../lib/api/validation';
export async function GET(request:Request){const ctx=await apiContext(request,'notifications');if(ctx.response)return ctx.response;
 try{const raw=new URL(request.url).searchParams.get('cursor'),cursor=raw?object(JSON.parse(raw),['createdAt','id']):null;if(cursor&&(!uuid(cursor.id)||typeof cursor.createdAt!=='string'||!Number.isFinite(Date.parse(cursor.createdAt))))return failure('INVALID',400);
  const r=await ctx.client.rpc('get_kinnso_inbox',{p_cursor:cursor});
  if(!r.error&&Array.isArray(r.data?.items))for(const event of r.data.items){if(recentVerifiedOutcome(event)&&uuid(event.id))await successEvent(ctx.actor,'verified_outcome',event.id);}
  return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return failure('INVALID',400);}}
export async function POST(request:Request){const ctx=await apiContext(request,'notifications',true);if(ctx.response)return ctx.response;
 try{const b=object(await boundedBody(request,4096),['requestId','command']);if(!uuid(b.requestId))return failure('INVALID',400);const command=object(b.command,['type','id','channel','enabled']);const r=await ctx.client.rpc('apply_kinnso_inbox_command',{p_request_id:b.requestId,p_command:command});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('INVALID',400);}}
