// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { constructEventMock, rpcMock } = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => ({ webhooks: { constructEvent: constructEventMock } }),
}))
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcMock }),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function makeRequest(body: string, signature: string | null) {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: signature ? { 'stripe-signature': signature } : {},
    body,
  })
}

beforeEach(() => {
  constructEventMock.mockReset()
  rpcMock.mockReset()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
})

describe('POST /api/stripe/webhook', () => {
  it('rejects a request with no signature header', async () => {
    const res = await POST(makeRequest('{}', null))
    expect(res.status).toBe(401)
  })

  it('rejects a request with an invalid signature', async () => {
    constructEventMock.mockImplementation(() => { throw new Error('bad signature') })
    const res = await POST(makeRequest('{}', 'sig_bad'))
    expect(res.status).toBe(400)
  })

  it('confirms the booking on a paid checkout.session.completed event', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_status: 'paid', payment_intent: 'pi_123' } },
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('confirm_booking_from_webhook', {
      p_stripe_payment_intent_id: 'pi_123',
      p_stripe_checkout_session_id: 'cs_123',
    })
  })

  it('confirms the booking when a delayed payment later succeeds', async () => {
    // Delayed-notification methods deliver `completed` while still unpaid, so
    // this event is the only one that ever confirms such a booking.
    constructEventMock.mockReturnValue({
      type: 'checkout.session.async_payment_succeeded',
      data: { object: { id: 'cs_async', payment_status: 'paid', payment_intent: 'pi_async' } },
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('confirm_booking_from_webhook', {
      p_stripe_payment_intent_id: 'pi_async',
      p_stripe_checkout_session_id: 'cs_async',
    })
  })

  it('does not confirm a completed session that is not yet paid', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_unpaid', payment_status: 'unpaid', payment_intent: 'pi_unpaid' } },
    })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('confirms the booking when payment_intent is an expanded object, not a string', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_status: 'paid', payment_intent: { id: 'pi_456' } } },
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('confirm_booking_from_webhook', {
      p_stripe_payment_intent_id: 'pi_456',
      p_stripe_checkout_session_id: 'cs_123',
    })
  })

  it('ignores a checkout.session.completed event that is not yet paid', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_status: 'unpaid', payment_intent: 'pi_123' } },
    })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the confirmation RPC fails, so Stripe retries', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_status: 'paid', payment_intent: 'pi_123' } },
    })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(500)
  })

  it('ignores unrelated event types', async () => {
    constructEventMock.mockReturnValue({ type: 'payment_intent.created', data: { object: {} } })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
