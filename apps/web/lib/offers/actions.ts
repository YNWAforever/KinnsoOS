'use server'

import { cookies } from 'next/headers'
import { requireTravelerAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Locale } from '@/lib/i18n/config'

const FRIENDLY: Record<string, string> = {
  offer_cap_reached: 'This offer is fully claimed',
  visitor_limit_reached: "You've already claimed this offer",
  offer_not_live: 'This offer is no longer available',
}

const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function claimOfferAction(
  offerId: string,
  creatorId: string,
  guideId: string | null,
  source: 'guide' | 'profile',
  // `locale`/`journeyId` are captured client-side (getCurrentJourneyId reads
  // localStorage, which is unavailable in this server action) and threaded
  // through by the caller -- see OfferClaimCard's claim().
  options?: { locale?: Locale; journeyId?: string | null },
): Promise<ActionResult<{ claimId: string }>> {
  const { locale, journeyId } = options ?? {}
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('claim_offer', {
    p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: guideId, p_source: source,
    p_journey_id: journeyId ?? null,
    p_locale: journeyId ? (locale ?? null) : null,
  })
  if (error || !data) {
    if (error) console.error('[offers] claim failed', error)
    return formError(mapError(error?.message ?? '', 'This offer could not be claimed'))
  }

  const result = data as { claim_id: string; raw_token: string; expires_at: string }
  const cookieStore = await cookies()
  cookieStore.set(`offer-token-${result.claim_id}`, result.raw_token, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
  })

  return { ok: true, claimId: result.claim_id }
}
