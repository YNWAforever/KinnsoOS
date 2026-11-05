import {GET as canonicalCallback} from '../../../auth/callback/route';
import {prepareLegacyAuthCallback} from '../../../../lib/auth/legacy-callback';

export async function GET(request:Request,{params}:{params:Promise<{locale:string}>}){
 const{locale}=await params,forwarded=prepareLegacyAuthCallback(request,locale);
 if(!forwarded)return Response.json({ok:false,code:'INVALID_CALLBACK'},{status:400,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 return canonicalCallback(forwarded);
}
