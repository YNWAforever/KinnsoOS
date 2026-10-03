import { describe, expect, it } from 'vitest'
import {
  toCreatorEarningItem,
  summarizeCreatorEarnings,
  type CreatorSettlementRow,
} from '@/lib/missions/earnings'

const row = (over: Partial<CreatorSettlementRow> = {}): CreatorSettlementRow => ({
  id: 's1',
  creator_payout_status: null,
  amount_currency: 'usd',
  creator_commission_amount: null,
  paid_fee_amount: null,
  missions: { title: 'Hotel program', mission_type: 'coupon_affiliate', mission_source: 'travelpayouts' },
  ...over,
})

describe('toCreatorEarningItem', () => {
  it('sums commission + paid fee and defaults nulls to zero', () => {
    const item = toCreatorEarningItem(row({ creator_commission_amount: 40, paid_fee_amount: 10 }))
    expect(item.amount).toBe(50)
    expect(item.currency).toBe('USD')
    expect(item.payoutStatus).toBe('pending')
    expect(item.missionTitle).toBe('Hotel program')
  })

  it('marks paid rows as paid and uses a default currency when missing', () => {
    const item = toCreatorEarningItem(row({ creator_payout_status: 'paid', amount_currency: null }))
    expect(item.payoutStatus).toBe('paid')
    expect(item.currency).toBe('USD')
    expect(item.amount).toBe(0)
  })

  it('reads the mission when the join is returned as an array', () => {
    const item = toCreatorEarningItem(row({ missions: [{ title: 'Array join', mission_type: 'paid', mission_source: 'merchant' }] }))
    expect(item.missionTitle).toBe('Array join')
    expect(item.missionType).toBe('paid')
  })
})

describe('summarizeCreatorEarnings', () => {
  it('returns an empty array for no items', () => {
    expect(summarizeCreatorEarnings([])).toEqual([])
  })

  it('buckets by currency and paid/pending, sorted by currency', () => {
    const totals = summarizeCreatorEarnings([
      { id: 'a', missionTitle: 'A', missionType: 'paid', currency: 'USD', amount: 100, payoutStatus: 'paid' },
      { id: 'b', missionTitle: 'B', missionType: 'coupon_affiliate', currency: 'USD', amount: 30, payoutStatus: 'pending' },
      { id: 'c', missionTitle: 'C', missionType: 'paid', currency: 'HKD', amount: 500, payoutStatus: 'paid' },
    ])
    expect(totals).toEqual([
      { currency: 'HKD', paid: 500, pending: 0 },
      { currency: 'USD', paid: 100, pending: 30 },
    ])
  })
})
