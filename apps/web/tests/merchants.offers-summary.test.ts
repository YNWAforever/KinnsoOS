import { describe, it, expect } from 'vitest'
import { summarizeOffers, type MerchantOfferRow } from '@/lib/merchants/offers-queries'

function offer(overrides: Partial<MerchantOfferRow>): MerchantOfferRow {
  return {
    id: 'o1', title: 't', terms: 'x', discountKind: 'item', discountValue: 1,
    commissionKind: 'flat', commissionValue: 10, validFrom: '2027-01-01T00:00:00.000Z',
    validTo: '2027-06-01T00:00:00.000Z', perVisitorLimit: 1, totalCap: null,
    claimedCount: 0, redeemedCount: 0, status: 'live', ...overrides,
  }
}

describe('summarizeOffers', () => {
  it('sums claimed and redeemed counts across all offers', () => {
    const summary = summarizeOffers([
      offer({ claimedCount: 5, redeemedCount: 2 }),
      offer({ claimedCount: 3, redeemedCount: 1 }),
    ])
    expect(summary).toEqual({ totalClaimed: 8, totalRedeemed: 3 })
  })

  it('returns zeros for an empty offer list', () => {
    expect(summarizeOffers([])).toEqual({ totalClaimed: 0, totalRedeemed: 0 })
  })
})
