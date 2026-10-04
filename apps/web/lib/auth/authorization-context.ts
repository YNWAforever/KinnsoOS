import type { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  resolveViewerRoleFromFacts,
  type ViewerRole,
} from './viewer-role-policy'

export type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type AuthorizationUser = { id: string }

export type AuthorizationContext = {
  user: AuthorizationUser | null
  role: ViewerRole | 'indeterminate'
  merchantId: string | null
}

export async function getAuthorizationContext(
  supabase: ServerSupabase,
  verifiedUserId?: string,
): Promise<AuthorizationContext> {
  const user = verifiedUserId
    ? { id: verifiedUserId }
    : (await supabase.auth.getUser()).data.user

  if (!user) {
    return { user: null, role: 'anon', merchantId: null }
  }

  const { data: ops, error: opsError } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  const { data: merchant, error: merchantError } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: creator, error: creatorError } = await supabase
    .from('creators')
    .select('status')
    .eq('id', user.id)
    .maybeSingle()

  if (opsError || merchantError || creatorError) {
    return { user: { id: user.id }, role: 'indeterminate', merchantId: null }
  }

  const merchantId = merchant && typeof merchant.id === 'string' ? merchant.id : null
  let hasCreatorHandle = false

  if (!ops && !merchant && creator?.status === 'onboarding') {
    const { data: handle, error: handleError } = await supabase
      .from('creator_social_handles')
      .select('id')
      .eq('creator_id', user.id)
      .limit(1)
      .maybeSingle()

    if (handleError) {
      return { user: { id: user.id }, role: 'indeterminate', merchantId: null }
    }

    hasCreatorHandle = Boolean(handle)
  }

  return {
    user: { id: user.id },
    role: resolveViewerRoleFromFacts({
      authenticated: true,
      hasActiveOps: Boolean(ops),
      hasMerchantProfile: Boolean(merchant),
      hasActiveCreator: creator?.status === 'active',
      hasCreatorHandle,
    }),
    merchantId,
  }
}
