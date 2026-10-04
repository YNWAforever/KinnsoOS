import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/ops-validation'
import type { Locale } from '@/lib/i18n/config'

const applicationsPath = (locale: Locale) => `/${locale}/admin/merchants/applications`

const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  not_found: 'That application no longer exists. Refresh and try again.',
  not_pending: 'This application was already decided. Refresh and try again.',
  already_merchant: 'This user already has a merchant profile.',
}
const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function approveMerchantApplicationAction(
  locale: Locale,
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string; merchantProfileId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { data, error } = await supabase.rpc('admin_approve_merchant_application', { p_id: id, p_reason: reason.trim() })
  if (error || !data) {
    if (error) console.error('[admin:merchant-applications] approve failed', error)
    return formError(mapError(error?.message ?? '', 'Application could not be approved'))
  }
  revalidatePath(applicationsPath(locale))
  return { ok: true, id, merchantProfileId: data as string }
}

export async function rejectMerchantApplicationAction(
  locale: Locale,
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_reject_merchant_application', { p_id: id, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:merchant-applications] reject failed', error)
    return formError(mapError(error.message, 'Application could not be rejected'))
  }
  revalidatePath(applicationsPath(locale))
  return { ok: true, id }
}
