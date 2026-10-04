import { describe, expect, it } from 'vitest'
import { nextTierUnlocks } from '@/lib/perks/next-tier'
import { progressToNext } from '@/lib/contribution/tiers'
import type { ActivePerk } from '@/lib/perks/queries'

function perk(overrides: Partial<ActivePerk> = {}): ActivePerk {
  return {
    id: 'p1',
    slug: 'lounge',
    partner_name: 'Plaza Premium',
    title: 'Lounge access',
    summary: 'One visit per month.',
    category: 'travel',
    discount_label: '100% off',
    min_tier: 'pro',
    redemption_type: 'code',
    ...overrides,
  } as ActivePerk
}

describe('nextTierUnlocks', () => {
  it('names the perks gated at the next tier, not the ones already available', () => {
    const unlocks = nextTierUnlocks(progressToNext(55), [
      perk({ id: 'already', min_tier: 'rising', title: 'Already mine' }),
      perk({ id: 'next', min_tier: 'pro', title: 'Lounge access' }),
      perk({ id: 'far', min_tier: 'elite', title: 'Two tiers away' }),
      perk({ id: 'open', min_tier: null, title: 'Open to all' }),
    ])
    expect(unlocks?.nextTier).toBe('pro')
    expect(unlocks?.perks.map((p) => p.title)).toEqual(['Lounge access'])
  })

  it('reports the points remaining so the ask is concrete', () => {
    // 55 points is `rising`; `pro` starts at 150.
    expect(nextTierUnlocks(progressToNext(55), [])?.pointsForNext).toBe(95)
  })

  it('returns null at the top of the ladder rather than inventing a next tier', () => {
    expect(nextTierUnlocks(progressToNext(400), [perk({ min_tier: 'elite' })])).toBeNull()
  })

  it('returns an empty perk list when nothing is gated at the next tier', () => {
    // Honesty: the caller must be able to say "nothing is gated there" rather than
    // borrow a perk from another tier to manufacture motivation.
    const unlocks = nextTierUnlocks(progressToNext(0), [perk({ min_tier: 'elite' })])
    expect(unlocks?.nextTier).toBe('rising')
    expect(unlocks?.perks).toEqual([])
  })

  it('carries the partner name, because the perk is only credible with one', () => {
    const unlocks = nextTierUnlocks(progressToNext(0), [
      perk({ min_tier: 'rising', partner_name: 'Klook', title: 'HK$100 credit' }),
    ])
    expect(unlocks?.perks[0]).toEqual({ title: 'HK$100 credit', partnerName: 'Klook' })
  })

  it('keeps the catalog order stable so the panel does not reshuffle between loads', () => {
    const unlocks = nextTierUnlocks(progressToNext(0), [
      perk({ id: 'a', min_tier: 'rising', title: 'A' }),
      perk({ id: 'b', min_tier: 'rising', title: 'B' }),
    ])
    expect(unlocks?.perks.map((p) => p.title)).toEqual(['A', 'B'])
  })
})
