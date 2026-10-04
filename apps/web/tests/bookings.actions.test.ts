// apps/web/tests/bookings.actions.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { rpcMock, createServerClientMock, stripeRefundsCreateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createServerClientMock: vi.fn(),
  stripeRefundsCreateMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createServerClientMock,
}))

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => ({ refunds: { create: stripeRefundsCreateMock } }),
}))

import {
  adminCancelAndRefundBookingAction,
  adminSetBookingSettlementStatusAction,
  markBookingCompletedAction,
} from '@/lib/bookings/actions'

beforeEach(() => {
  rpcMock.mockReset()
  createServerClientMock.mockReset()
  stripeRefundsCreateMock.mockReset()
})

describe('markBookingCompletedAction', () => {
  it('returns a friendly error when the RPC reports bad_transition', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'bad_transition' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/not confirmed yet/i)
  })

  it('returns a friendly error when the RPC reports not_found', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'not_found' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/not found/i)
  })

  it('returns a friendly error when the RPC reports forbidden', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'forbidden' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/don.t have access/i)
  })

  it('falls back to a generic error for an unmapped failure', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'something_else' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/something went wrong/i)
  })

  it('calls mark_booking_completed with the booking id and returns ok+id on success', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: null })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.id).toBe('booking-1')
    expect(rpcMock).toHaveBeenCalledWith('mark_booking_completed', { p_booking_id: 'booking-1' })
  })
})

describe('adminCancelAndRefundBookingAction', () => {
  /**
   * The action reads the booking (for its own payment intent + status) and
   * calls two RPCs: `is_active_ops_role` to authorize, then the refund RPC.
   */
  function mockClient(options: {
    isOpsAdmin?: boolean
    roleError?: { message: string } | null
    booking?: { status: string; stripe_payment_intent_id: string | null } | null
    bookingError?: { message: string } | null
  }) {
    const { isOpsAdmin = true, roleError = null, bookingError = null } = options
    const booking =
      options.booking === undefined
        ? { status: 'confirmed', stripe_payment_intent_id: 'pi_from_booking' }
        : options.booking

    rpcMock.mockImplementation((name: string) => {
      if (name === 'is_active_ops_role') {
        return Promise.resolve({ data: isOpsAdmin, error: roleError })
      }
      return Promise.resolve({ error: null })
    })

    const maybeSingle = vi.fn().mockResolvedValue({ data: booking, error: bookingError })
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }))
    createServerClientMock.mockResolvedValue({ rpc: rpcMock, from })
    return { from }
  }

  it('refuses — and never calls Stripe — when the caller is not an ops admin', async () => {
    mockClient({ isOpsAdmin: false })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    expect(stripeRefundsCreateMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalledWith(
      'admin_cancel_and_refund_booking',
      expect.anything(),
    )
  })

  it('refuses a blank reason before any refund is issued', async () => {
    mockClient({})

    const result = await adminCancelAndRefundBookingAction({ bookingId: 'booking-1', reason: '   ' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/reason is required/i)
    expect(stripeRefundsCreateMock).not.toHaveBeenCalled()
  })

  it('refuses an over-long reason before any refund is issued', async () => {
    mockClient({})

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      reason: 'x'.repeat(501),
    })

    expect(result.ok).toBe(false)
    expect(stripeRefundsCreateMock).not.toHaveBeenCalled()
  })

  it('refuses a booking that is not refundable before any refund is issued', async () => {
    mockClient({ booking: { status: 'pending_payment', stripe_payment_intent_id: 'pi_x' } })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/not confirmed yet/i)
    expect(stripeRefundsCreateMock).not.toHaveBeenCalled()
  })

  it('refuses a missing booking before any refund is issued', async () => {
    mockClient({ booking: null })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/not found/i)
    expect(stripeRefundsCreateMock).not.toHaveBeenCalled()
  })

  it("refunds the booking's own payment intent, never one supplied by the caller", async () => {
    mockClient({ booking: { status: 'completed', stripe_payment_intent_id: 'pi_from_booking' } })
    stripeRefundsCreateMock.mockResolvedValue({ id: 're_abc123' })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      // A caller-supplied payment intent is not part of the contract at all.
      reason: 'traveller requested cancellation',
    } as { bookingId: string; reason: string })

    expect(result.ok).toBe(true)
    expect(stripeRefundsCreateMock).toHaveBeenCalledWith(
      { payment_intent: 'pi_from_booking' },
      // Keyed on the booking so a retry cannot issue a second refund.
      { idempotencyKey: 'booking-refund-booking-1' },
    )
  })

  it('does not call the refund RPC if the Stripe refund call fails', async () => {
    mockClient({})
    stripeRefundsCreateMock.mockRejectedValue(new Error('stripe down'))

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalledWith(
      'admin_cancel_and_refund_booking',
      expect.anything(),
    )
  })

  it('calls the RPC with the real Stripe refund id on success', async () => {
    mockClient({})
    stripeRefundsCreateMock.mockResolvedValue({ id: 're_abc123' })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.id).toBe('booking-1')
      expect(result.stripeRefundId).toBe('re_abc123')
    }
    expect(rpcMock).toHaveBeenCalledWith('admin_cancel_and_refund_booking', {
      p_booking_id: 'booking-1',
      p_stripe_refund_id: 're_abc123',
      p_reason: 'traveller requested cancellation',
    })
  })

  it('surfaces the reconciliation gap plainly when the RPC fails after a successful refund', async () => {
    mockClient({})
    stripeRefundsCreateMock.mockResolvedValue({ id: 're_abc123' })
    rpcMock.mockImplementation((name: string) => {
      if (name === 'is_active_ops_role') return Promise.resolve({ data: true, error: null })
      return Promise.resolve({ error: { message: 'not_found' } })
    })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.form?.[0]).toContain('re_abc123')
      expect(result.errors.form?.[0]).toMatch(/reconcile manually/i)
    }
  })
})

describe('adminSetBookingSettlementStatusAction', () => {
  it('calls the RPC with all fields mapped to their p_ args, defaulting optionals', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: null })

    const result = await adminSetBookingSettlementStatusAction({
      settlementId: 'settlement-1',
      status: 'paid',
      reason: 'manual reconciliation',
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.id).toBe('settlement-1')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_booking_settlement_status', {
      p_id: 'settlement-1',
      p_status: 'paid',
      p_merchant_payout_status: undefined,
      p_creator_commission_status: undefined,
      p_kinnso_commission_status: undefined,
      p_allow_revert: false,
      p_reason: 'manual reconciliation',
    })
  })

  it('passes allowRevert through when explicitly set', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: null })

    await adminSetBookingSettlementStatusAction({
      settlementId: 'settlement-1',
      merchantPayoutStatus: 'pending',
      allowRevert: true,
      reason: 'correcting a mistaken payout mark',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'admin_set_booking_settlement_status',
      expect.objectContaining({ p_allow_revert: true, p_merchant_payout_status: 'pending' }),
    )
  })

  it('returns a friendly error when the RPC reports bad_transition', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'bad_transition' } })

    const result = await adminSetBookingSettlementStatusAction({
      settlementId: 'settlement-1',
      status: 'not_started',
      reason: 'revert attempt',
    })

    expect(result.ok).toBe(false)
  })
})
