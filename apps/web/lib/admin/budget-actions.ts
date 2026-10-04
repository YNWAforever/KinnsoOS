import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/ops-validation'
import type { Locale } from '@/lib/i18n/config'

const detailPath = (locale: Locale, merchantId: string) => `/${locale}/admin/merchants/${merchantId}`

const FRIENDLY: Record<string, string> = {
  forbidden: 'Admin ops access is required.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  bad_amount: 'The amount must be a non-zero number.',
  bad_amount_precision: 'Amounts must have at most 2 decimal places and fit within the budget range.',
  bad_enforced: 'Invalid enforcement value.',
  insufficient_budget: 'That adjustment would take the balance below zero.',
  not_found: 'No budget exists for this merchant yet — credit it first.',
}
const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function creditMerchantBudget(
  locale: Locale, merchantId: string, amount: number, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!Number.isFinite(amount) || amount === 0) return formError(FRIENDLY.bad_amount)
  // amount * 100 is an IEEE-754 double, not exact decimal arithmetic -- a genuine two-decimal
  // value like 19.99 lands at 1998.9999999999998, not 1999. Comparing against the ROUNDED
  // cents with a tight tolerance (not an exact equality check) correctly accepts every real
  // 2dp value while still rejecting genuine sub-cent input like 0.001. The DB's own check
  // (`p_amount <> round(p_amount, 2)` on exact Postgres numeric) remains the source of truth
  // either way -- this is purely a client-side pre-check for a faster error.
  const cents = amount * 100
  if (Math.abs(cents - Math.round(cents)) > 1e-6 || Math.abs(amount) > 9999999999.99) {
    return formError(FRIENDLY.bad_amount_precision)
  }
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_credit_merchant_budget', {
    p_merchant_profile_id: merchantId, p_amount: amount, p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:merchants] creditMerchantBudget failed', error)
    return formError(mapError(error.message, 'Budget could not be credited'))
  }
  revalidatePath(detailPath(locale, merchantId))
  return { ok: true, id: merchantId }
}

export async function setBudgetEnforcement(
  locale: Locale, merchantId: string, enforced: boolean, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_set_budget_enforcement', {
    p_merchant_profile_id: merchantId, p_enforced: enforced, p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:merchants] setBudgetEnforcement failed', error)
    return formError(mapError(error.message, 'Enforcement could not be changed'))
  }
  revalidatePath(detailPath(locale, merchantId))
  return { ok: true, id: merchantId }
}
