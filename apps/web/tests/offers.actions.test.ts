import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requireTravelerActionMock, rpcMock, cookieSetMock } = vi.hoisted(() => ({
  requireTravelerActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'visitor-1' },
  })),
  rpcMock: vi.fn(),
  cookieSetMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireTravelerAction: requireTravelerActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSetMock }) }))

import { claimOfferAction } from '@/lib/offers/actions'

beforeEach(() => { requireTravelerActionMock.mockClear(); rpcMock.mockReset(); cookieSetMock.mockClear() })

describe('claimOfferAction', () => {
  it('fails the gate for a signed-out caller', async () => {
    requireTravelerActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Sign in is required'] } })
    const result = await claimOfferAction('offer-1', 'creator-1', null, 'profile')
    expect(result.ok).toBe(false)
  })

  it('calls claim_offer with the right args and sets a scoped, httpOnly cookie with the raw token', async () => {
    rpcMock.mockResolvedValue({ data: { claim_id: 'claim-1', raw_token: 'rawtoken123', expires_at: '2027-06-01T00:00:00.000Z' }, error: null })
    const result = await claimOfferAction('offer-1', 'creator-1', 'guide-1', 'guide')
    expect(rpcMock).toHaveBeenCalledWith('claim_offer', {
      p_offer_id: 'offer-1', p_creator_id: 'creator-1', p_guide_id: 'guide-1', p_source: 'guide',
      p_journey_id: null, p_locale: null,
    })
    expect(result).toEqual({ ok: true, claimId: 'claim-1' })
    expect(cookieSetMock).toHaveBeenCalledWith(
      'offer-token-claim-1', 'rawtoken123',
      expect.objectContaining({ httpOnly: true, secure: true, maxAge: 300 }),
    )
  })

  it('passes null journey_id/locale when no journey id is supplied (unconsented)', async () => {
    rpcMock.mockResolvedValue({ data: { claim_id: 'claim-1', raw_token: 'rawtoken123', expires_at: '2027-06-01T00:00:00.000Z' }, error: null })
    await claimOfferAction('offer-1', 'creator-1', 'guide-1', 'guide', { locale: 'en', journeyId: null })
    expect(rpcMock).toHaveBeenCalledWith('claim_offer', {
      p_offer_id: 'offer-1', p_creator_id: 'creator-1', p_guide_id: 'guide-1', p_source: 'guide',
      p_journey_id: null, p_locale: null,
    })
  })

  it('passes null journey_id/locale when no options are supplied at all', async () => {
    rpcMock.mockResolvedValue({ data: { claim_id: 'claim-1', raw_token: 'rawtoken123', expires_at: '2027-06-01T00:00:00.000Z' }, error: null })
    await claimOfferAction('offer-1', 'creator-1', 'guide-1', 'guide')
    expect(rpcMock).toHaveBeenCalledWith('claim_offer', {
      p_offer_id: 'offer-1', p_creator_id: 'creator-1', p_guide_id: 'guide-1', p_source: 'guide',
      p_journey_id: null, p_locale: null,
    })
  })

  it('passes the real journey id and locale when a journey id is supplied (consented)', async () => {
    rpcMock.mockResolvedValue({ data: { claim_id: 'claim-1', raw_token: 'rawtoken123', expires_at: '2027-06-01T00:00:00.000Z' }, error: null })
    await claimOfferAction('offer-1', 'creator-1', 'guide-1', 'guide', { locale: 'en', journeyId: '11111111-1111-4111-8111-111111111111' })
    expect(rpcMock).toHaveBeenCalledWith('claim_offer', {
      p_offer_id: 'offer-1', p_creator_id: 'creator-1', p_guide_id: 'guide-1', p_source: 'guide',
      p_journey_id: '11111111-1111-4111-8111-111111111111', p_locale: 'en',
    })
  })

  it('returns a friendly error when the RPC fails, without leaking the raw error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'offer_cap_reached' } })
    const result = await claimOfferAction('offer-1', 'creator-1', null, 'profile')
    expect(result.ok).toBe(false)
    expect(cookieSetMock).not.toHaveBeenCalled()
  })
})
