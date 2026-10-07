import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {serverClient} from '../../../lib/supabase/server';
import {callbackOrigin} from '../../../lib/auth/callback-origin';
import {parseAuthIntent,authPath} from '../../../lib/auth/auth-intent';
import {createRecoveryProof,recoveryConfigured} from '../../../lib/auth/recovery-proof';
import {RECOVERY_COOKIE} from '../../../lib/auth/recovery';
export async function GET(request:Request){
 const url=new URL(request.url),origin=callbackOrigin(process.env);
 if(!origin)return Response.json({ok:false,code:'UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});
 const intent=parseAuthIntent(url.searchParams,url.searchParams.get('locale')??(url.searchParams.get('next')?.startsWith('/zh-HK/')?'zh-HK':'en'));
 const send=(path:string)=>NextResponse.redirect(new URL(path,origin),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 const retry=intent.flow==='recovery'?'forgot-password':intent.flow==='sign-up'?'sign-up':'sign-in';
 const client=await serverClient(),jar=await cookies();jar.delete(RECOVERY_COOKIE);
 if(!client)return send(authPath(intent,retry,{error:'unavailable'}));
 if(intent.flow==='recovery'&&!recoveryConfigured(process.env.KINNSO_AUTH_RECOVERY_SECRET))return send(authPath(intent,retry,{error:'unavailable'}));
 if(intent.flow==='recovery'||intent.flow==='sign-up'){
  const current=await client.auth.getUser();
  // Cookie presence may only restrict a flow, never authorize one. If a session
  // cannot be verified during a transient provider failure, do not replace it.
  if(current.data.user||jar.getAll().some(cookie=>/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)))return send(authPath(intent,retry,{error:'active'}));
 }
 const code=url.searchParams.get('code'),hash=url.searchParams.get('token_hash');
 let result;
 try{
  if(code&&code.length<=2048)result=await client.auth.exchangeCodeForSession(code);
  else if(hash&&hash.length<=2048&&((intent.flow==='recovery'&&url.searchParams.get('type')==='recovery')||(intent.flow==='sign-up'&&url.searchParams.get('type')==='email')))result=await client.auth.verifyOtp({token_hash:hash,type:intent.flow==='recovery'?'recovery':'email'});
 }catch{return send(authPath(intent,retry,{error:'failed'}));}
 if(!result||result.error||!result.data.user)return send(authPath(intent,retry,{error:'failed'}));
 if(intent.flow!=='recovery')return send(intent.next);
 // PKCE recovery must have the SDK recovery verifier; OTP type is verified by Auth.
 if(code&&(!('redirectType' in result.data)||result.data.redirectType!=='recovery'))return send(authPath(intent,'forgot-password',{error:'failed'}));
 const user=await client.auth.getUser(),claims=await client.auth.getClaims();
 const sessionId=claims.data?.claims.session_id;
 if(user.error||!user.data.user||claims.error||claims.data?.claims.sub!==user.data.user.id||typeof sessionId!=='string')return send(authPath(intent,'forgot-password',{error:'failed'}));
 jar.set(RECOVERY_COOKIE,createRecoveryProof({userId:user.data.user.id,sessionId,locale:intent.locale,next:intent.next},process.env.KINNSO_AUTH_RECOVERY_SECRET!),{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'lax',path:'/',maxAge:900});
 return send(authPath(intent,'reset-password'));
}
