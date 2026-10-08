import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
export async function GET(request:Request){
 const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;
 const query=new URL(request.url).searchParams,id=query.get('id'),after=query.get('after');
 if(!uuid(id)||(after!==null&&!uuid(after))||[...query.keys()].some(key=>!['id','after'].includes(key)||query.getAll(key).length!==1))return failure('INVALID',400);
 try{const r=await ctx.client.rpc('list_kinnso_merchant_invitations',{p_merchant_id:id,p_after:after});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}
}
export async function POST(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 try{
  if(new URL(request.url).search)throw Error('INVALID');
  const body=object(await boundedBody(request,16384),['merchantId','requestId','command']);if(!uuid(body.merchantId)||!uuid(body.requestId))throw Error('INVALID');
  const command=object(body.command,['type','id','token','email','label','role','branchIds','reason']);
  if(!uuid(command.id)||typeof command.reason!=='string'||!command.reason.trim()||command.reason.length>2000)throw Error('INVALID');
  if(command.type==='create'){
   if(typeof command.token!=='string'||command.token.length!==64||!/^[0-9a-f]{64}$/.test(command.token)||typeof command.email!=='string'||command.email.length>254||!/^\S+@\S+\.\S+$/.test(command.email.trim())||typeof command.label!=='string'||!command.label.trim()||command.label.length>120||!['marketing','clerk','finance'].includes(String(command.role))||!Array.isArray(command.branchIds)||command.branchIds.length>100||command.branchIds.some(id=>!uuid(id))||new Set(command.branchIds).size!==command.branchIds.length)throw Error('INVALID');
  }else if(command.type==='revoke'){object(command,['type','id','reason']);}else throw Error('INVALID');
  const r=await ctx.client.rpc('apply_kinnso_merchant_invitation',{p_merchant_id:body.merchantId,p_request_id:body.requestId,p_command:command});
  if(r.error?.message==='invitation_limit')return failure('INVALID',400);
  return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch(error){return error instanceof SyntaxError||(error instanceof Error&&error.message==='INVALID')?failure('INVALID',400):failure('UNAVAILABLE',503);}
}
