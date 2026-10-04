import {timingSafeEqual} from 'node:crypto';
/** A scheduler credential does not authorize another origin or an unconfigured environment. */
export function cronAccess(request:Request,env:Record<string,string|undefined>):'AUTH_REQUIRED'|'FORBIDDEN'|null {
 const secret=env.CRON_SECRET;
 if(!secret||secret.length<32||secret.length>1024||secret.trim()!==secret)return 'AUTH_REQUIRED';
 const supplied=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret);
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return 'AUTH_REQUIRED';
 try{const site=new URL(env.KINNSO_SITE_URL??'');return !site.username&&!site.password&&site.pathname==='/'&&!site.search&&!site.hash&&new URL(request.url).origin===site.origin?null:'FORBIDDEN';}catch{return 'FORBIDDEN';}
}
export const cronAuthorized=(request:Request,env:Record<string,string|undefined>)=>cronAccess(request,env)===null;
