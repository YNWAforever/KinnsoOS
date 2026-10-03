import {capabilities} from '../../../../../lib/contracts/capabilities';
import {sharedMedia,unifiedMediaEnvironment} from '../../../../../lib/media/service';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{token:string;id:string}>}) {
 const {token,id}=await params;const target=process.env.KINNSO_SERVICES_ORIGIN;
 if(capabilities(process.env).sharing.mode!=='connected'||!/^[0-9a-f]{64}$/.test(token)||!/^[-0-9a-f]{36}$/.test(id))return new Response(null,{status:404,headers:{'Cache-Control':'private, no-store'}});
 if(process.env.KINNSO_MEDIA_RUNTIME==='unified') {
  try{const data=await sharedMedia(token,id,unifiedMediaEnvironment(process.env));return new Response(data.blob,{headers:{'Content-Type':data.mime,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}})}
  catch{return new Response(null,{status:404,headers:{'Cache-Control':'private, no-store'}})}
 }
 if(!target||target!==process.env.KINNSO_APPROVED_SERVICES_ORIGIN)return new Response(null,{status:404,headers:{'Cache-Control':'private, no-store'}});
 try{const origin=new URL(target);if(origin.protocol!=='https:'&&!(process.env.KINNSO_ENVIRONMENT==='local'&&origin.origin==='http://127.0.0.1:3492'))return new Response(null,{status:404});const result=await fetch(origin.origin+'/api/kinnso/shared-media/'+token+'/'+id,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!result.ok)return new Response(null,{status:404,headers:{'Cache-Control':'private, no-store'}});return new Response(result.body,{headers:{'Content-Type':result.headers.get('content-type')??'application/octet-stream','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}})}catch{return new Response(null,{status:404,headers:{'Cache-Control':'private, no-store'}})}
}
