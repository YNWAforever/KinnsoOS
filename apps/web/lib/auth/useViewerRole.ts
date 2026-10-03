'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { resolveViewerRoleFromFacts, type ViewerRole } from './viewer-role-policy'
export type { ViewerRole } from './viewer-role-policy'

/**
 * Thin viewer-role hook (replaces the redesign's MockAuthContext).
 * Reads the real Supabase session client-side; defaults to 'anon'.
 * Pass `override` to force a role (e.g. a merchant-context host).
 */
export function useViewerRole(override?: ViewerRole): ViewerRole {
  const [role, setRole] = useState<ViewerRole>('anon')

  useEffect(() => {
    // When a host forces a role, skip session resolution entirely; the
    // override is surfaced directly via the return value below (no
    // synchronous setState in the effect).
    if (override) return
    const supabase = createSupabaseBrowserClient()
    let active = true
    let latestResolution = 0

    const resolveSignedInRole = async (userId: string): Promise<ViewerRole> => {
      const [{ data: ops }, { data: merchant }, { data: creator }] = await Promise.all([
        supabase
          .from('kinnso_ops_members')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('merchant_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('creators')
          .select('status')
          .eq('id', userId)
          .maybeSingle(),
      ])
      let hasCreatorHandle = false

      if (!ops && !merchant && creator?.status === 'onboarding') {
        const { data: handle, error: handleError } = await supabase
          .from('creator_social_handles')
          .select('id')
          .eq('creator_id', userId)
          .limit(1)
          .maybeSingle()

        if (handleError) throw handleError
        hasCreatorHandle = Boolean(handle)
      }

      return resolveViewerRoleFromFacts({
        authenticated: true,
        hasActiveOps: Boolean(ops),
        hasMerchantProfile: Boolean(merchant),
        hasActiveCreator: creator?.status === 'active',
        hasCreatorHandle,
      })
    }

    const initialResolution = ++latestResolution
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || initialResolution !== latestResolution) return
      if (!data.user) {
        setRole('anon')
        return
      }
      const nextRole = await resolveSignedInRole(data.user.id)
      if (!active || initialResolution !== latestResolution) return
      setRole(nextRole)
    }).catch((error: unknown) => {
      if (active && initialResolution === latestResolution) {
        setRole('anon')
        console.error('Failed to resolve viewer role', error)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const resolution = ++latestResolution
      if (!session?.user) {
        if (active) setRole('anon')
        return
      }
      try {
        const nextRole = await resolveSignedInRole(session.user.id)
        if (active && resolution === latestResolution) setRole(nextRole)
      } catch (error) {
        if (active && resolution === latestResolution) {
          setRole('anon')
          console.error('Failed to resolve viewer role', error)
        }
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [override])

  return override ?? role
}
