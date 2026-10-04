'use server'

import { revalidatePath } from 'next/cache'
import { LOCALES } from '@/lib/i18n/config'
import { requireMerchantAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type RedeemResult = {
  redemptionId: string
  redeemedAt: string
  alreadyRedeemed: boolean
}

export async function redeemOfferClaimAction(
  rawToken: string,
  amountSpent: number | null,
): Promise<ActionResult<RedeemResult>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('redeem_offer_claim', {
    p_raw_token: rawToken, p_amount_spent: amountSpent,
  })
  if (error || !data) {
    if (error) console.error('[offers] redeem failed', error)
    const message = (error as { message?: string } | null)?.message ?? ''
    if (message.includes('claim_not_found')) return formError('Code not recognized')
    if (message.includes('claim_expired')) return formError('This offer has expired')
    if (message.includes('amount_spent_required')) return formError('Enter the amount spent')
    return formError('Could not redeem this offer')
  }

  const result = data as { redemption_id?: string; redeemed_at?: string; already_redeemed?: boolean; expired?: boolean }
  if (result.expired) return formError('This offer has expired')

  // Every real route is /[locale]/merchants/dashboard/offers, so the unlocalized
  // path this used to pass matched no cache entry and merchants kept seeing a
  // stale offer list. Offer state is locale-independent, so all seven are
  // refreshed -- the same shape as lib/admin/sessions-actions.ts.
  for (const l of LOCALES) revalidatePath(`/${l}/merchants/dashboard/offers`)
  return {
    ok: true,
    redemptionId: result.redemption_id as string,
    redeemedAt: result.redeemed_at as string,
    alreadyRedeemed: result.already_redeemed as boolean,
  }
}
