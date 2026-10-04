import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requireMerchantActionMock, rpcMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string }; merchantId: string } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'staff-1' }, merchantId: 'merchant-1',
  })),
  rpcMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { redeemOfferClaimAction } from '@/lib/offers/redeem-actions'

beforeEach(() => { requireMerchantActionMock.mockClear(); rpcMock.mockReset() })

describe('redeemOfferClaimAction', () => {
  it('fails the gate for a non-merchant caller', async () => {
    requireMerchantActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Merchant access is required'] } })
    const result = await redeemOfferClaimAction('rawtoken', null)
    expect(result.ok).toBe(false)
  })

  it('passes through a successful first-time redemption', async () => {
    rpcMock.mockResolvedValue({ data: { redemption_id: 'r1', redeemed_at: '2027-01-01T00:00:00.000Z', already_redeemed: false }, error: null })
    const result = await redeemOfferClaimAction('rawtoken', 50)
    expect(result).toEqual({ ok: true, redemptionId: 'r1', redeemedAt: '2027-01-01T00:00:00.000Z', alreadyRedeemed: false })
  })

  it('surfaces a friendly message for claim_expired without leaking the raw error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'claim_expired' } })
    const result = await redeemOfferClaimAction('rawtoken', null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form[0]).toBe('This offer has expired')
  })

  it('reports a friendly error when the claim has expired, not a false success', async () => {
    rpcMock.mockResolvedValue({ data: { expired: true }, error: null })
    const result = await redeemOfferClaimAction('rawtoken', null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form[0]).toBe('This offer has expired')
  })
})
