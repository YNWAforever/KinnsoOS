import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
export async function POST(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 try{
  if(new URL(request.url).search)throw Error('INVALID');
  const body=object(await boundedBody(request,1024),['action','token','requestId']);
  if(typeof body.token!=='string'||body.token.length!==64||!/^[0-9a-f]{64}$/.test(body.token))throw Error('INVALID');
  let r;
  if(body.action==='preview'){object(body,['action','token']);r=await ctx.client.rpc('preview_kinnso_merchant_invitation',{p_token:body.token});}
  else if(body.action==='accept'&&uuid(body.requestId))r=await ctx.client.rpc('accept_kinnso_merchant_invitation',{p_token:body.token,p_request_id:body.requestId});
  else throw Error('INVALID');
  return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch(error){return error instanceof SyntaxError||(error instanceof Error&&error.message==='INVALID')?failure('INVALID',400):failure('UNAVAILABLE',503);}
}
