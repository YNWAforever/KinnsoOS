'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Json } from '@kinnso/db'
export async function publishStructuredGuide(id:string,expectedVersion:number,requestId:string,content:unknown,locale:string) {
  const client = await createSupabaseServerClient()
  const user = await client.auth.getUser()
  if (user.error || !user.data.user) return {ok:false as const,code:'AUTH_REQUIRED'}
  const result = await client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:expectedVersion,p_request_id:requestId,p_content:content as Json})
  if (result.error) return {ok:false as const,code:result.error.message.includes('conflict') ? 'CONFLICT' : 'INVALID'}
  revalidatePath(`/${locale}/explore`);revalidatePath(`/${locale}/studio/guides`)
  return {ok:true as const,data:result.data}
}
export async function withdrawStructuredGuide(id:string,locale:string) {
  const client = await createSupabaseServerClient()
  if (!(await client.auth.getUser()).data.user) return {ok:false as const}
  const result = await client.rpc('withdraw_guide_versions',{p_guide_id:id})
  if (!result.error) revalidatePath(`/${locale}/explore`)
  return {ok:!result.error}
}
