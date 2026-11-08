import {NextResponse,type NextRequest} from 'next/server';
import {cookies} from 'next/headers';
import {serverClient} from '../../../../lib/supabase/server';
import {RECOVERY_COOKIE} from '../../../../lib/auth/recovery';

export async function GET(request:NextRequest,context:{params:Promise<{locale:string}>}){
 const requested=(await context.params).locale.toLowerCase();
 const locale=requested==='zh-hk'?'zh-HK':'en';
 const destination=(error?:string)=>new URL(`/${locale}/sign-in${error?`?error=${error}`:''}`,request.url);
 // A browser-generated cross-site navigation must not clear another site's session.
 if(request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.redirect(destination());
 const client=await serverClient();
 if(!client)return NextResponse.redirect(destination('unavailable'));
 const result=await client.auth.signOut({scope:'local'});
 if(result.error)return NextResponse.redirect(destination('unavailable'));
 (await cookies()).delete(RECOVERY_COOKIE);
 return NextResponse.redirect(destination());
}
