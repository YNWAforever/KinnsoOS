'use server';
import { redirect } from 'next/navigation';
import { serverClient } from '../../../lib/supabase/server';
import { safeReturnPath } from '../../../lib/auth/return-path';
import {cookies} from 'next/headers';
import {RECOVERY_COOKIE} from '../../../lib/auth/recovery';
export async function signIn(form: FormData) {
  const locale = form.get('locale') === 'zh-HK' ? 'zh-HK' : 'en';
  const next = safeReturnPath(form.get('next'), locale);
  const client = await serverClient();
  if (!client) redirect(`/${locale}/sign-in?error=unavailable&next=${encodeURIComponent(next)}`);
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || email.length > 254 || !password || password.length > 1024) {
    redirect(`/${locale}/sign-in?error=invalid&next=${encodeURIComponent(next)}`);
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) redirect(`/${locale}/sign-in?error=failed&next=${encodeURIComponent(next)}`);
  (await cookies()).delete(RECOVERY_COOKIE);
  redirect(next);
}
export async function signOut() {
  const client = await serverClient();
  if(!client)return {ok:false as const};
  const result=await client.auth.signOut({ scope: 'local' });
  if(!result.error)(await cookies()).delete(RECOVERY_COOKIE);
  return {ok:!result.error};
}
