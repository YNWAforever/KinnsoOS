import { notFound, redirect } from 'next/navigation'
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthorizationContext } from '@/lib/auth/authorization-context'
import { formError, type ActionFailure } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Page gate: redirect anon to sign-in, notFound for non-ops. Returns the ops user. */
export async function requireOpsPage(supabase: Supabase, loc: Locale): Promise<{ user: { id: string } }> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) redirect(`/${loc}/sign-in`)
  if (context.role !== 'ops') notFound()
  return { user: context.user }
}

/** Page gate: redirect anon, hide non-merchants, and return the server-derived merchant ID. */
export async function requireMerchantPage(
  supabase: Supabase,
  loc: Locale,
): Promise<{ user: { id: string }; merchantId: string }> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) redirect(`/${loc}/sign-in`)
  if (context.role !== 'merchant' || !context.merchantId) notFound()
  return { user: context.user, merchantId: context.merchantId }
}

/**
 * Page gate: redirect anon to sign-in, then deny non-creators. Returns the creator user.
 *
 * `denied` exists because the studio's role-checking pages historically split into
 * several behaviours and they are asserted by host tests: most `notFound()` (the default
 * here), /studio/insights and /studio/tier `redirect()` to the hub, and the guide and
 * session authoring pages send a not-yet-active creator to onboarding at /creator --
 * every sign-up gets a blank `creators` row, so a session alone is not a creator, and a
 * 404 would strand someone who is mid-application. This helper preserves each page's
 * existing behaviour rather than silently unifying it.
 *
 * `creators.id` IS `auth.uid()`, so the returned `user.id` is directly usable as a
 * creator id — the same rule requireCreatorAction documents.
 */
export async function requireCreatorPage(
  supabase: Supabase,
  loc: Locale,
  denied: 'not-found' | 'studio' | 'creator' = 'not-found',
): Promise<{ user: { id: string } }> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) redirect(`/${loc}/sign-in`)
  if (context.role !== 'creator') {
    if (denied === 'studio') redirect(`/${loc}/studio`)
    if (denied === 'creator') redirect(`/${loc}/creator`)
    notFound()
  }
  return { user: context.user }
}

/** Action gate: typed failure for anon/non-ops; ok+user for ops. */
export async function requireOpsAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) return formError('Sign in is required')
  if (context.role !== 'ops') return formError('Active ops access is required')
  return { ok: true, user: context.user }
}

/**
 * Action gate: typed failure for anon/non-creator; ok+user for a creator.
 * Unlike requireMerchantAction, no extra lookup is needed — creators.id IS
 * auth.uid() directly (creators is a one-row-per-auth-user table), so
 * user.id can be used as host_creator_id / community_sessions ownership
 * directly by the caller.
 */
export async function requireCreatorAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) return formError('Sign in is required')
  if (context.role !== 'creator') return formError('Creator access is required')
  return { ok: true, user: context.user }
}

/**
 * Action gate: typed failure for anon/non-merchant; ok+user+merchantId for a
 * merchant. Uses the server-derived `merchant_profiles.id` from the
 * authorization context so callers can scope writes to the owning merchant
 * (RLS still enforces ownership).
 */
export async function requireMerchantAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string }; merchantId: string } | ActionFailure> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) return formError('Sign in is required')
  if (context.role !== 'merchant' || !context.merchantId) {
    return formError('Merchant access is required')
  }
  return { ok: true, user: context.user, merchantId: context.merchantId }
}

/**
 * Action gate: typed failure for anon; ok+user for any signed-in traveller. No
 * role or profile-table lookup -- any authenticated user may save/review as a
 * traveller (D-R6A-4/D-R6A-6), unlike requireMerchantAction's ownership check.
 */
export async function requireTravelerAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  return { ok: true, user }
}
