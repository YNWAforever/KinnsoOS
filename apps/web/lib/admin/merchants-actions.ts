import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason, validateBulkIds } from '@/lib/admin/ops-validation'
import { isMerchantStatus, isMerchantTier, type MerchantStatus, type MerchantTier } from '@/lib/admin/merchants-validation'
import type { Locale } from '@/lib/i18n/config'

const dirPath = (locale: Locale) => `/${locale}/admin/merchants/directory`

const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  bad_status: 'Invalid status.',
  bad_tier: 'Invalid tier.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  no_change: 'Nothing to change — pick a different value.',
  not_found: 'That merchant no longer exists. Refresh and try again.',
  bad_bulk: 'Select between 1 and 100 merchants.',
}
const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function setMerchantStatus(
  locale: Locale, id: string, status: MerchantStatus, reason: string,
): Promise<ActionResult<{ id: string; status: MerchantStatus }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isMerchantStatus(status)) return formError(FRIENDLY.bad_status)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_set_merchant_status', { p_id: id, p_status: status, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:merchants] setMerchantStatus failed', error)
    return formError(mapError(error.message, 'Status could not be changed'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, id, status }
}

export async function setMerchantTier(
  locale: Locale, id: string, tier: MerchantTier, reason: string,
): Promise<ActionResult<{ id: string; tier: MerchantTier }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isMerchantTier(tier)) return formError(FRIENDLY.bad_tier)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_set_merchant_tier', { p_id: id, p_tier: tier, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:merchants] setMerchantTier failed', error)
    return formError(mapError(error.message, 'Tier could not be changed'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, id, tier }
}

export async function addMerchantNote(
  locale: Locale, id: string, note: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(note)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_add_merchant_note', { p_id: id, p_note: note.trim() })
  if (error) {
    console.error('[admin:merchants] addMerchantNote failed', error)
    return formError(mapError(error.message, 'Note could not be saved'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, id }
}

export async function bulkSetMerchantStatus(
  locale: Locale, ids: string[], status: MerchantStatus, reason: string,
): Promise<ActionResult<{ count: number }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isMerchantStatus(status)) return formError(FRIENDLY.bad_status)
  const bErr = validateBulkIds(ids)
  if (bErr) return formError(FRIENDLY[bErr])
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { data, error } = await supabase.rpc('admin_bulk_set_merchant_status', { p_ids: ids, p_status: status, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:merchants] bulkSetMerchantStatus failed', error)
    return formError(mapError(error.message, 'Bulk update failed'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, count: Number(data ?? 0) }
}
