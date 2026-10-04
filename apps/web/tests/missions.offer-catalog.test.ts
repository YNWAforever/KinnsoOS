// apps/web/tests/missions.offer-catalog.test.ts
import { describe, it, expect } from 'vitest'
import { OFFER_CATALOG, type OfferCatalogEntry } from '@/lib/missions/offer-catalog'

const CATEGORIES = new Set(['Hotels & stays', 'Flights & hotels', 'Tours & activities', 'Travel eSIM', 'Flights'])

describe('OFFER_CATALOG', () => {
  it('has 8 entries with unique external program ids', () => {
    expect(OFFER_CATALOG).toHaveLength(8)
    const ids = OFFER_CATALOG.map((e) => e.externalProgramId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry is well-formed', () => {
    for (const e of OFFER_CATALOG) {
      expect(e.externalProgramId).toMatch(/^tp-[a-z0-9-]+$/)
      expect(e.programName.trim().length).toBeGreaterThan(0)
      expect(e.programUrl).toMatch(/^https:\/\/[^\s]+$/)
      expect(e.title.trim().length).toBeGreaterThan(0)
      expect(e.summary.trim().length).toBeGreaterThan(0)
      expect(e.commissionDescription.trim().length).toBeGreaterThan(0)
      expect(e.defaultCurrency).toMatch(/^[A-Z]{3}$/)
      expect(CATEGORIES.has(e.category)).toBe(true)
      for (const rate of [e.affiliateCommissionRate, e.creatorCommissionRate, e.kinnsoCommissionRate]) {
        expect(Number.isFinite(rate)).toBe(true)
        expect(rate).toBeGreaterThanOrEqual(0)
        expect(rate).toBeLessThanOrEqual(100)
      }
    }
  })

  it('satisfies the OfferCatalogEntry type at compile time', () => {
    const first: OfferCatalogEntry = OFFER_CATALOG[0]
    expect(first).toBeTruthy()
  })
})
