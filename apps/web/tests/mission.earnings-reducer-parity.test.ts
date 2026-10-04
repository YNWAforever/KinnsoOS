import { describe, expect, it } from 'vitest'
import {
  bucketEarningsByCurrency,
  summarizeCreatorEarnings,
  type CreatorEarningItem,
  type EarningsBucketEntry,
} from '@/lib/missions/earnings'
import {
  summarizeSettledEarnings,
  type BookingEarningItem,
  type MissionEarningItem,
} from '@/lib/missions/earnings-summary'

/**
 * The studio dashboard (/studio) totals via summarizeCreatorEarnings; /studio/earnings totals via
 * summarizeSettledEarnings. Until R10.1 mints settlement rows both are always empty, so a
 * divergence between them is invisible today and would surface later as the two pages quoting a
 * creator different amounts of money. These tests fail if the two ever stop agreeing.
 */

/** The economic facts, independent of which item shape carries them. */
const FACTS: EarningsBucketEntry[] = [
  { currency: 'HKD', amount: 1200, payoutStatus: 'pending' },
  { currency: 'HKD', amount: 80.5, payoutStatus: 'paid' },
  { currency: 'USD', amount: 10, payoutStatus: 'paid' },
  { currency: 'USD', amount: 2.25, payoutStatus: 'paid' },
  { currency: 'JPY', amount: 500, payoutStatus: 'pending' },
]

const asDashboardItems = (facts: EarningsBucketEntry[]): CreatorEarningItem[] =>
  facts.map((f, i) => ({
    id: `d${i}`,
    missionTitle: '',
    missionType: '',
    currency: f.currency,
    amount: f.amount,
    payoutStatus: f.payoutStatus,
  }))

const asMissionItems = (facts: EarningsBucketEntry[]): MissionEarningItem[] =>
  facts.map((f, i) => ({
    id: `m${i}`,
    missionTitle: '',
    missionType: '',
    missionSource: '',
    currency: f.currency,
    amount: f.amount,
    payoutStatus: f.payoutStatus,
  }))

const asBookingItems = (facts: EarningsBucketEntry[]): BookingEarningItem[] =>
  facts.map((f, i) => ({
    id: `b${i}`,
    experienceTitle: '',
    currency: f.currency,
    amount: f.amount,
    payoutStatus: f.payoutStatus,
  }))

describe('earnings reducer parity', () => {
  it('both surfaces total the same facts identically', () => {
    const dashboard = summarizeCreatorEarnings(asDashboardItems(FACTS))
    const earnings = summarizeSettledEarnings(asMissionItems(FACTS), [])

    expect(dashboard).toEqual(earnings)
    expect(dashboard).toEqual([
      { currency: 'HKD', paid: 80.5, pending: 1200 },
      { currency: 'JPY', paid: 0, pending: 500 },
      { currency: 'USD', paid: 12.25, pending: 0 },
    ])
  })

  it('agrees regardless of how the facts are split across missions and bookings', () => {
    const dashboard = summarizeCreatorEarnings(asDashboardItems(FACTS))

    // Same facts, three different splits across the two arrays the earnings page passes.
    const allMissions = summarizeSettledEarnings(asMissionItems(FACTS), [])
    const allBookings = summarizeSettledEarnings([], asBookingItems(FACTS))
    const split = summarizeSettledEarnings(
      asMissionItems(FACTS.slice(0, 2)),
      asBookingItems(FACTS.slice(2)),
    )

    expect(allMissions).toEqual(dashboard)
    expect(allBookings).toEqual(dashboard)
    expect(split).toEqual(dashboard)
  })

  it.each([
    ['empty', [] as EarningsBucketEntry[]],
    ['all paid', [{ currency: 'HKD', amount: 5, payoutStatus: 'paid' as const }]],
    ['all pending', [{ currency: 'HKD', amount: 5, payoutStatus: 'pending' as const }]],
    ['one currency, both statuses', [
      { currency: 'THB', amount: 1, payoutStatus: 'paid' as const },
      { currency: 'THB', amount: 2, payoutStatus: 'pending' as const },
    ]],
  ])('agrees on the %s case', (_label, facts) => {
    expect(summarizeCreatorEarnings(asDashboardItems(facts))).toEqual(
      summarizeSettledEarnings(asMissionItems(facts), []),
    )
  })

  it('both delegate to the shared reducer rather than reimplementing it', () => {
    // If either function grew its own loop again, its result could drift from the helper's.
    const viaHelper = bucketEarningsByCurrency(FACTS)
    expect(summarizeCreatorEarnings(asDashboardItems(FACTS))).toEqual(viaHelper)
    expect(summarizeSettledEarnings(asMissionItems(FACTS), [])).toEqual(viaHelper)
  })

  it('sorts by currency code, not insertion order', () => {
    const out = bucketEarningsByCurrency([
      { currency: 'USD', amount: 1, payoutStatus: 'paid' },
      { currency: 'HKD', amount: 1, payoutStatus: 'paid' },
      { currency: 'JPY', amount: 1, payoutStatus: 'paid' },
    ])
    expect(out.map((t) => t.currency)).toEqual(['HKD', 'JPY', 'USD'])
  })
})
