import { describe, it, expect } from 'vitest'
import { mapPerkCard } from '@/lib/perks/list'
import type { ActivePerk } from '@/lib/perks/queries'

const row: ActivePerk = {
  id: 'p1', slug: 'k', partner_name: 'Klook', title: 'K', summary: 's',
  category: 'Travel', discount_label: '10%', min_tier: 'pro', redemption_type: 'code', sort_order: 0,
}

describe('mapPerkCard', () => {
  it('is locked when the creator is below the required tier', () => {
    expect(mapPerkCard(row, 'rising', new Set()).state).toBe('locked')
  })
  it('is redeemable when the creator meets the tier', () => {
    expect(mapPerkCard(row, 'pro', new Set()).state).toBe('redeemable')
  })
  it('is redeemable for an open (null-tier) perk at any tier', () => {
    expect(mapPerkCard({ ...row, min_tier: null }, 'seed', new Set()).state).toBe('redeemable')
  })
  it('is redeemed when in the redeemed set (regardless of tier)', () => {
    expect(mapPerkCard(row, 'seed', new Set(['p1'])).state).toBe('redeemed')
  })
  it('maps snake_case columns to camelCase fields', () => {
    const c = mapPerkCard(row, 'pro', new Set())
    expect(c.partnerName).toBe('Klook')
    expect(c.discountLabel).toBe('10%')
    expect(c.minTier).toBe('pro')
  })
})
