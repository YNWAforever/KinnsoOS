'use server';
import {redirect} from 'next/navigation';
import {cookies} from 'next/headers';
import {serverClient} from '../../../lib/supabase/server';
import {parseAuthIntent,authPath,authCallbackUrl} from '../../../lib/auth/auth-intent';
import {callbackOrigin} from '../../../lib/auth/callback-origin';
import {recoveryConfigured} from '../../../lib/auth/recovery-proof';
import {RECOVERY_COOKIE} from '../../../lib/auth/recovery';
export async function requestRecovery(form:FormData){
 const intent=parseAuthIntent(new URLSearchParams({flow:'recovery',next:String(form.get('next')??'')}),String(form.get('locale')));
 const client=await serverClient(),origin=callbackOrigin(process.env);
 if(!client||!origin||!recoveryConfigured(process.env.KINNSO_AUTH_RECOVERY_SECRET))redirect(authPath(intent,'forgot-password',{error:'unavailable'}));
 const current=await client.auth.getUser();if(current.data.user)redirect(authPath(intent,'forgot-password',{error:'active'}));
 const email=String(form.get('email')??'').trim();
 if(!email||email.length>254)redirect(authPath(intent,'forgot-password',{error:'invalid'}));
 (await cookies()).delete(RECOVERY_COOKIE);
 // Identical conditional acknowledgement confirms neither existence nor delivery.
 try{await client.auth.resetPasswordForEmail(email,{redirectTo:authCallbackUrl(intent,origin)});}catch{/* Keep provider details private; offer retry. */}
 redirect(authPath(intent,'forgot-password',{sent:'1'}));
}
export async function restartRecovery(form:FormData){
 const intent=parseAuthIntent(new URLSearchParams({flow:'recovery',next:String(form.get('next')??'')}),String(form.get('locale')));
 const client=await serverClient();if(!client)redirect(authPath(intent,'forgot-password',{error:'unavailable'}));
 const result=await client.auth.signOut({scope:'local'});
 if(result.error)redirect(authPath(intent,'forgot-password',{error:'failed'}));
 (await cookies()).delete(RECOVERY_COOKIE);redirect(authPath(intent,'forgot-password'));
}
