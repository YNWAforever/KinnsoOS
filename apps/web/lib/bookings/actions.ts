'use server'

import { getStripeClient } from '@/lib/stripe/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formError, type ActionResult } from '@/lib/admin/result'

/** Maps the booking RPCs' raised error codes to friendly, surfaceable messages. */
const FRIENDLY: Record<string, string> = {
  bad_transition: 'This booking is not confirmed yet, so it can’t be marked complete.',
  not_found: 'Booking not found.',
  forbidden: 'You don’t have access to this booking.',
  settlement_not_found: 'This booking has no settlement record yet. Please contact engineering.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (500 characters max).',
  refund_id_required: 'A Stripe refund id is required.',
  no_change: 'No changes were provided.',
  bad_status: 'That is not a valid settlement status.',
  bad_leg_status: 'That is not a valid payout/commission status.',
  no_creator_leg: 'This booking has no creator commission leg to update.',
}

/** Find the first known error code mentioned in the RPC error message. */
function mapRpcError(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? ''
  for (const [code, friendly] of Object.entries(FRIENDLY)) {
    if (message.includes(code)) return friendly
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Marks a confirmed booking as completed. `mark_booking_completed` is
 * SECURITY DEFINER and itself enforces that the caller owns the experience's
 * merchant profile — this action does not duplicate that check.
 */
export async function markBookingCompletedAction(
  bookingId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('mark_booking_completed', { p_booking_id: bookingId })
  if (error) return formError(mapRpcError(error))
  return { ok: true, id: bookingId }
}

/** Booking statuses `admin_cancel_and_refund_booking` accepts. */
const REFUNDABLE_STATUSES = new Set(['confirmed', 'completed'])
const MAX_REASON_LENGTH = 500

/**
 * Ops-admin only: cancels a booking and issues its Stripe refund.
 *
 * A refund cannot be un-done, so everything that could reject the operation is
 * checked BEFORE Stripe is called: the caller's ops-admin rank, the reason
 * rules, the booking's existence, and its status. `admin_cancel_and_refund_booking`
 * re-checks all of them server-side (it is SECURITY DEFINER and enforces
 * `is_active_ops_role('admin')`), but it runs after the money has moved, so it
 * cannot be the only gate.
 *
 * The payment intent is read from the booking row rather than accepted from the
 * caller — a refund can therefore only ever target the payment this booking
 * made, never an arbitrary one supplied by the client.
 *
 * A narrow reconciliation gap remains by design (PD-R3B-5): if the RPC fails
 * after a successful refund (e.g. a concurrent status change), the refund
 * stands. The pre-checks make that window small, and the failure is surfaced
 * plainly so ops knows to reconcile manually.
 */
export async function adminCancelAndRefundBookingAction(input: {
  bookingId: string
  reason: string
}): Promise<ActionResult<{ id: string; stripeRefundId: string }>> {
  const supabase = await createSupabaseServerClient()

  // Authorization first — before any side effect. Mirrors the RPC's own
  // `is_active_ops_role('admin')` bar rather than a looser "any ops" check.
  const { data: isOpsAdmin, error: roleError } = await supabase.rpc('is_active_ops_role', {
    p_min: 'admin',
  })
  if (roleError) return formError('Something went wrong. Please try again.')
  if (!isOpsAdmin) return formError(FRIENDLY.forbidden)

  const reason = input.reason?.trim() ?? ''
  if (!reason) return formError(FRIENDLY.reason_required)
  if (reason.length > MAX_REASON_LENGTH) return formError(FRIENDLY.reason_too_long)

  const { data: booking, error: lookupError } = await supabase
    .from('bookings')
    .select('status, stripe_payment_intent_id')
    .eq('id', input.bookingId)
    .maybeSingle()
  if (lookupError) return formError('Something went wrong. Please try again.')
  if (!booking) return formError(FRIENDLY.not_found)
  if (!REFUNDABLE_STATUSES.has(booking.status as string)) return formError(FRIENDLY.bad_transition)

  const paymentIntentId = booking.stripe_payment_intent_id as string | null
  if (!paymentIntentId) {
    return formError('This booking has no Stripe payment to refund.')
  }

  const stripe = getStripeClient()
  let refundId: string
  try {
    // Keyed on the booking so a retried call (network blip, double submit)
    // returns the original refund instead of issuing a second one.
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `booking-refund-${input.bookingId}` },
    )
    refundId = refund.id
  } catch {
    return formError('Stripe refund failed. No changes were made to the booking.')
  }

  // `admin_cancel_and_refund_booking` (migration 20260704170000, Task 4) is not
  // yet in packages/db/types.ts's generated RPC union — types were last
  // regenerated after Tasks 2-3 landed (mark_booking_completed and
  // admin_set_booking_settlement_status are both present) but before Task 4's
  // migration was applied live. Cast the name narrowly here rather than
  // widening the shared `.rpc()` typing; delete this cast the next time
  // `pnpm --filter @kinnso/db gen` runs against a DB with this migration applied.
  const { error } = await supabase.rpc(
    'admin_cancel_and_refund_booking' as Parameters<typeof supabase.rpc>[0],
    {
      p_booking_id: input.bookingId,
      p_stripe_refund_id: refundId,
      p_reason: reason,
    },
  )

  if (error) {
    return formError(
      `Stripe refund ${refundId} succeeded, but updating the booking failed: ${mapRpcError(error)} Reconcile manually.`,
    )
  }

  return { ok: true, id: input.bookingId, stripeRefundId: refundId }
}

/**
 * Ops-only: sets one or more legs of a booking's settlement status.
 * `admin_set_booking_settlement_status` is SECURITY DEFINER and itself
 * enforces `is_active_ops_role('admin')` plus every status-transition rule.
 */
export async function adminSetBookingSettlementStatusAction(input: {
  settlementId: string
  status?: string
  merchantPayoutStatus?: string
  creatorCommissionStatus?: string
  kinnsoCommissionStatus?: string
  allowRevert?: boolean
  reason: string
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('admin_set_booking_settlement_status', {
    p_id: input.settlementId,
    p_status: input.status,
    p_merchant_payout_status: input.merchantPayoutStatus,
    p_creator_commission_status: input.creatorCommissionStatus,
    p_kinnso_commission_status: input.kinnsoCommissionStatus,
    p_allow_revert: input.allowRevert ?? false,
    p_reason: input.reason,
  })
  if (error) return formError(mapRpcError(error))
  return { ok: true, id: input.settlementId }
}
