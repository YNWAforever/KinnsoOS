import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/creators-validation'
import type { Locale } from '@/lib/i18n/config'

const payoutsPath = (locale: Locale) => `/${locale}/admin/creators/payouts`

/** DB raise-message → friendly copy, extending the FRIENDLY map convention from creators-actions.ts. */
const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  creator_required: 'A creator is required.',
  currency_required: 'A currency is required.',
  bad_amount: 'Enter an amount greater than zero.',
  idempotency_key_required: 'Missing request id — reload and try again.',
  idempotency_conflict: 'This request was already submitted with different details. Reload and try again.',
  batch_already_pending: 'This creator already has a pending batch in this currency. Resolve it first.',
  not_found: 'That payout batch no longer exists. Refresh and try again.',
  bad_transition: 'That batch can no longer be changed.',
  target_at_in_past: 'The target date must be in the future.',
}

const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export interface CreatePayoutBatchInput {
  creatorId: string
  currency: string
  amount: number
  idempotencyKey: string
}

export async function createPayoutBatch(
  locale: Locale, input: CreatePayoutBatchInput, reason: string,
): Promise<ActionResult<{ batchId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!input.creatorId.trim()) return formError(FRIENDLY.creator_required)
  if (!input.currency.trim()) return formError(FRIENDLY.currency_required)
  if (!Number.isFinite(input.amount) || input.amount <= 0) return formError(FRIENDLY.bad_amount)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { data, error } = await supabase.rpc('admin_create_payout_batch', {
    p_creator_id: input.creatorId.trim(),
    p_currency: input.currency.trim(),
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:payouts] createPayoutBatch failed', error)
    return formError(mapError(error.message, 'Payout batch could not be created'))
  }
  revalidatePath(payoutsPath(locale))
  const result = data as { batch_id: string }
  return { ok: true, batchId: result.batch_id }
}

export async function markPayoutBatchPaid(
  locale: Locale, batchId: string, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_mark_payout_paid', { p_batch_id: batchId, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:payouts] markPayoutBatchPaid failed', error)
    return formError(mapError(error.message, 'Payout batch could not be marked paid'))
  }
  revalidatePath(payoutsPath(locale))
  return { ok: true, id: batchId }
}

export interface CancelPayoutBatchInput {
  batchId: string
  idempotencyKey: string
}

export async function cancelPayoutBatch(
  locale: Locale, input: CancelPayoutBatchInput, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_cancel_payout', {
    p_batch_id: input.batchId,
    p_idempotency_key: input.idempotencyKey,
    p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:payouts] cancelPayoutBatch failed', error)
    return formError(mapError(error.message, 'Payout batch could not be cancelled'))
  }
  revalidatePath(payoutsPath(locale))
  return { ok: true, id: input.batchId }
}
