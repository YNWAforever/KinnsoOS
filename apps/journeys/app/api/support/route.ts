import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
export async function GET(request:Request){const ctx=await apiContext(request,'notifications');if(ctx.response)return ctx.response;const q=new URL(request.url).searchParams,after=q.get('after');if(after&&!uuid(after))return failure('INVALID',400);const r=await ctx.client.rpc('get_kinnso_support',{p_ops:q.get('ops')==='true',p_after:after});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}
export async function POST(request:Request){const ctx=await apiContext(request,'notifications',true);if(ctx.response)return ctx.response;
 let requestId:string,command:Record<string,unknown>;
 try{const b=object(await boundedBody(request,12000),['requestId','command']);if(!uuid(b.requestId))return failure('INVALID',400);requestId=b.requestId;
  command=object(b.command,['type','id','expectedRevision','subject','message','linkedEventId','ownerId','status','reason','context']);
  if(command.context!==undefined&&command.type!=='create')return failure('INVALID',400);
  if(command.context!==undefined&&command.context!==null){const c=object(command.context,['type','id']);if(command.type!=='create'||c.type!=='mission'||!uuid(c.id))return failure('INVALID',400);}
 }catch{return failure('INVALID',400);}
 try{const r=await ctx.client.rpc('apply_kinnso_support_command',{p_request_id:requestId,p_command:command});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}}
