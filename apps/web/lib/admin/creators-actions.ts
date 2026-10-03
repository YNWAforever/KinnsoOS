import { revalidatePath } from 'next/cache'
import type { Database } from '@kinnso/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { isCreatorStatus, validateReason, validateBulkIds, isSettlementStatus, isLegStatus, type CreatorStatus, type SettlementStatus, type LegStatus } from '@/lib/admin/creators-validation'
import type { Locale } from '@/lib/i18n/config'

const dirPath = (locale: Locale) => `/${locale}/admin/creators/directory`
const payoutsPath = (locale: Locale) => `/${locale}/admin/creators/payouts`

/** DB raise-message → friendly copy. The RPCs raise these bare messages. */
const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  bad_status: 'Invalid status.',
  bad_transition: "That transition is not allowed from the creator’s current state.",
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  not_found: 'That creator no longer exists. Refresh and try again.',
  not_banned: 'Only a banned creator can be reinstated.',
  bad_bulk: 'Select between 1 and 100 creators.',
  bad_leg_status: 'Invalid payout status.',
  no_change: 'Nothing to change — pick a different status.',
}

const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function setCreatorStatus(
  locale: Locale, id: string, status: CreatorStatus, reason: string,
): Promise<ActionResult<{ id: string; status: CreatorStatus }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isCreatorStatus(status) || status === 'onboarding') return formError(FRIENDLY.bad_status)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_set_creator_status', { p_id: id, p_status: status, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:creators] setCreatorStatus failed', error)
    return formError(mapError(error.message, 'Status could not be changed'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, id, status }
}

export async function reinstateCreator(
  locale: Locale, id: string, reason: string,
): Promise<ActionResult<{ id: string; status: 'active' }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_reinstate_creator', { p_id: id, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:creators] reinstateCreator failed', error)
    return formError(mapError(error.message, 'Creator could not be reinstated'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, id, status: 'active' }
}

export async function setCreatorVerified(
  locale: Locale, id: string, verified: boolean, reason: string,
): Promise<ActionResult<{ id: string; verified: boolean }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_set_creator_verified', { p_id: id, p_verified: verified, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:creators] setCreatorVerified failed', error)
    return formError(mapError(error.message, 'Verification could not be changed'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, id, verified }
}

export async function setCreatorListed(
  locale: Locale, id: string, isListed: boolean, reason: string,
): Promise<ActionResult<{ id: string; isListed: boolean }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const args: Database['public']['Functions']['admin_set_creator_listed']['Args'] = {
    p_id: id,
    p_is_listed: isListed,
    p_reason: reason.trim(),
  }
  const { error } = await supabase.rpc('admin_set_creator_listed', args)
  if (error) {
    console.error('[admin:creators] setCreatorListed failed', error)
    return formError(mapError(error.message, 'Directory listing could not be changed'))
  }
  revalidatePath(dirPath(locale))
  revalidatePath(`/${locale}/admin/creators/${id}`)
  revalidatePath(`/${locale}/creators`)
  revalidatePath('/sitemap.xml')
  return { ok: true, id, isListed }
}

export async function addCreatorNote(
  locale: Locale, id: string, note: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(note)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_add_creator_note', { p_id: id, p_note: note.trim() })
  if (error) {
    console.error('[admin:creators] addCreatorNote failed', error)
    return formError(mapError(error.message, 'Note could not be saved'))
  }
  revalidatePath(dirPath(locale))
  return { ok: true, id }
}

export async function bulkSetCreatorStatus(
  locale: Locale, ids: string[], status: CreatorStatus, reason: string,
): Promise<ActionResult<{ count: number }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isCreatorStatus(status) || status === 'onboarding') return formError(FRIENDLY.bad_status)
  const bErr = validateBulkIds(ids)
  if (bErr) return formError(FRIENDLY[bErr])
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { data, error } = await supabase.rpc('admin_bulk_set_creator_status', { p_ids: ids, p_status: status, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:creators] bulkSetCreatorStatus failed', error)
    return formError(mapError(error.message, 'Bulk update failed'))
  }
  return { ok: true, count: Number(data ?? 0) }
}

export interface SettlementStatusInput {
  status?: SettlementStatus
  creatorPayoutStatus?: LegStatus
  kinnsoCommissionStatus?: LegStatus
  affiliateCommissionStatus?: LegStatus
  allowRevert?: boolean
}

export async function setSettlementStatus(
  locale: Locale, id: string, input: SettlementStatusInput, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  if (input.status !== undefined && !isSettlementStatus(input.status)) return formError(FRIENDLY.bad_status)
  for (const leg of [input.creatorPayoutStatus, input.kinnsoCommissionStatus, input.affiliateCommissionStatus]) {
    if (leg !== undefined && !isLegStatus(leg)) return formError(FRIENDLY.bad_leg_status)
  }
  if (input.status === undefined && input.creatorPayoutStatus === undefined
      && input.kinnsoCommissionStatus === undefined && input.affiliateCommissionStatus === undefined) {
    return formError(FRIENDLY.no_change)
  }
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_set_settlement_status', {
    // Explicit `null` (not `undefined`) for every unchanged leg, matching this
    // RPC's own `default null` params and this file's existing test assertions.
    // The generated Args type below is imprecise here (typed `string | undefined`,
    // not `string | null | undefined`, for a SQL param whose default IS null) --
    // cast rather than drop the explicit nulls, since PostgREST treats an omitted
    // key and an explicit null identically over the wire, but tests here assert
    // the exact literal value passed to the client.
    p_id: id,
    p_status: input.status ?? null,
    p_creator_payout_status: input.creatorPayoutStatus ?? null,
    p_kinnso_commission_status: input.kinnsoCommissionStatus ?? null,
    p_affiliate_commission_status: input.affiliateCommissionStatus ?? null,
    p_allow_revert: input.allowRevert ?? false,
    p_reason: reason.trim(),
  } as Database['public']['Functions']['admin_set_settlement_status']['Args'])
  if (error) {
    console.error('[admin:creators] setSettlementStatus failed', error)
    return formError(mapError(error.message, 'Settlement status could not be changed'))
  }
  revalidatePath(payoutsPath(locale))
  return { ok: true, id }
}
