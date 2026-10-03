import {timingSafeEqual} from 'node:crypto';
import {failure,reply} from '../../../../lib/api/server';
import {cleanupMedia,unifiedMediaEnvironment} from '../../../../lib/media/service';

export const runtime='nodejs';
export const maxDuration=30;

export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32||secret.length>1024||secret.trim()!==secret)return failure('AUTH_REQUIRED',401);
 const provided=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret);
 if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return failure('AUTH_REQUIRED',401);
 try {
  const site=process.env.KINNSO_SITE_URL;
  if(!site||new URL(request.url).origin!==new URL(site).origin)return failure('FORBIDDEN',403);
  return reply({ok:true,data:await cleanupMedia(unifiedMediaEnvironment(process.env))});
 }catch{return failure('UNAVAILABLE',503)}
}
