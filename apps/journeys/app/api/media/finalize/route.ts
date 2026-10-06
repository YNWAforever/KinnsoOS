import {apiContext,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {finalizeMedia,unifiedMediaEnvironment} from '../../../../lib/media/service';
export const runtime='nodejs';
export async function POST(request:Request) {
 const ctx=await apiContext(request,'mediaUpload',true);if(ctx.response)return ctx.response;
 try{
  const body=object(await boundedBody(request,4096),['id','checksum']);if(!uuid(body.id)||typeof body.checksum!=='string'||!/^[0-9a-f]{64}$/.test(body.checksum))return failure('INVALID',400);
  if(process.env.KINNSO_MEDIA_RUNTIME==='unified') {
   const env=unifiedMediaEnvironment(process.env);
   const session=await ctx.client.auth.getSession();if(!session.data.session)return failure('AUTH_REQUIRED',401);
   try{return reply({ok:true,data:await finalizeMedia({token:session.data.session.access_token,id:body.id,checksum:body.checksum},env)})}
   catch(error){const code=error instanceof Error?error.message:'';return code==='AUTH_REQUIRED'?failure('AUTH_REQUIRED',401):code==='NOT_FOUND'?failure('NOT_FOUND',404):code==='INVALID_MEDIA'?failure('INVALID',400):failure('UNAVAILABLE',503)}
  }
  const target=process.env.KINNSO_SERVICES_ORIGIN;if(!target||target!==process.env.KINNSO_APPROVED_SERVICES_ORIGIN)return failure('UNAVAILABLE',503);
  const origin=new URL(target);if(origin.protocol!=='https:'&&!(process.env.KINNSO_ENVIRONMENT==='local'&&origin.origin==='http://127.0.0.1:3492'))return failure('UNAVAILABLE',503);
  const session=await ctx.client.auth.getSession();if(!session.data.session)return failure('AUTH_REQUIRED',401);
  const response=await fetch(origin.origin+'/api/kinnso/media/finalize',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.data.session.access_token,Origin:process.env.KINNSO_SITE_URL!},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});
  const result=await response.json();return reply(result,response.status);
 }catch{return failure('UNAVAILABLE',503)}
}
