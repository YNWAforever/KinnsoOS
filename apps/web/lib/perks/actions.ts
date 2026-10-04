import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'

/**
 * Redeem a perk: creator-gated, then the SECURITY DEFINER `redeem_perk` RPC enforces
 * the tier gate (hard) and logs idempotently. Returns the value to reveal client-side.
 * Re-calling for an already-redeemed perk is safe (ON CONFLICT DO NOTHING) and re-reveals.
 */
export async function redeemPerkAction(
  perkId: string,
): Promise<ActionResult<{ redemptionType: 'code' | 'link'; value: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('redeem_perk', { p_perk_id: perkId }).single()
  if (error || !data) {
    const message = error?.message ?? ''
    if (message.includes('below_tier')) return formError('This perk requires a higher tier')
    if (message.includes('perk_not_found')) return formError('This perk is no longer available')
    return formError('Perk could not be redeemed')
  }
  return { ok: true, redemptionType: data.redemption_type as 'code' | 'link', value: data.redemption_value }
}
