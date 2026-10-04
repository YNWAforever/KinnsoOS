import { describe, expect, it, vi } from 'vitest'
import { getCreatorEarningsSummary, getCreatorPayoutBatches, summarizeSettledEarnings } from '@/lib/missions/earnings-summary'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const raw = {
  mission_settlements: [
    {
      id: 'ms1',
      mission_title: 'Tokyo ramen crawl',
      mission_type: 'paid',
      mission_source: 'merchant',
      currency: 'HKD',
      amount: '1200.00',
      payout_status: 'pending',
    },
  ],
  booking_settlements: [
    {
      id: 'bs1',
      experience_title: 'Sunset harbour walk',
      currency: 'HKD',
      amount: '80.50',
      payout_status: 'paid',
    },
  ],
  tracked_affiliate: [
    {
      id: 'ev1',
      mission_title: 'Flight deals',
      currency: 'USD',
      gross_amount: '15.25',
      event_state: 'processing',
    },
  ],
}

describe('getCreatorEarningsSummary', () => {
  it('maps every section and coerces numeric strings to numbers', async () => {
    const result = await getCreatorEarningsSummary(client(raw))

    expect(result.missions).toEqual([
      {
        id: 'ms1',
        missionTitle: 'Tokyo ramen crawl',
        missionType: 'paid',
        missionSource: 'merchant',
        currency: 'HKD',
        amount: 1200,
        payoutStatus: 'pending',
      },
    ])
    expect(result.bookings[0].amount).toBe(80.5)
    expect(result.bookings[0].payoutStatus).toBe('paid')
    expect(result.tracked[0].grossAmount).toBe(15.25)
    expect(result.tracked[0].eventState).toBe('processing')
  })

  it('excludes tracked affiliate volume from the payable totals', async () => {
    const result = await getCreatorEarningsSummary(client(raw))

    // HKD only: 1200 pending (mission) + 80.50 paid (booking). The USD tracked row
    // is deliberately absent — it is recorded, not payable.
    expect(result.totals).toEqual([{ currency: 'HKD', paid: 80.5, pending: 1200 }])
    expect(result.totals.some((t) => t.currency === 'USD')).toBe(false)
  })

  it('returns empty sections rather than throwing when the creator has nothing', async () => {
    const result = await getCreatorEarningsSummary(
      client({ mission_settlements: [], booking_settlements: [], tracked_affiliate: [] }),
    )
    expect(result.missions).toEqual([])
    expect(result.bookings).toEqual([])
    expect(result.tracked).toEqual([])
    expect(result.totals).toEqual([])
  })

  it('tolerates missing arrays in the payload', async () => {
    const result = await getCreatorEarningsSummary(client({}))
    expect(result.missions).toEqual([])
    expect(result.totals).toEqual([])
  })

  it('throws when the RPC errors', async () => {
    await expect(getCreatorEarningsSummary(client(null, new Error('forbidden')))).rejects.toThrow('forbidden')
  })

  it('throws when the RPC returns no data', async () => {
    await expect(getCreatorEarningsSummary(client(null))).rejects.toThrow('creator_earnings_summary returned no data')
  })
})

describe('getCreatorPayoutBatches', () => {
  it('maps every field and coerces the numeric amount', async () => {
    const raw = [
      { id: 'b1', currency: 'HKD', amount: '1500.00', status: 'pending', target_at: '2026-08-23T00:00:00Z',
        created_at: '2026-08-16T00:00:00Z', paid_at: null, cancelled_at: null },
    ]
    // `client()` above casts its return to `never` internally, which makes `.rpc` fail to
    // typecheck on assertion (TS2339) — same trap Errata #10 documents for Task 6's original
    // admin.payout-batches-queries.test.ts. Keep this object un-cast and cast at the call site
    // instead, matching that file's now-established fix.
    const supabase = { rpc: vi.fn(async () => ({ data: raw, error: null })) }
    const result = await getCreatorPayoutBatches(supabase as never)
    expect(result).toEqual([
      { id: 'b1', currency: 'HKD', amount: 1500, status: 'pending', targetAt: '2026-08-23T00:00:00Z',
        createdAt: '2026-08-16T00:00:00Z', paidAt: null, cancelledAt: null },
    ])
    expect(supabase.rpc).toHaveBeenCalledWith('creator_payout_batches_mine')
  })

  it('returns an empty array for null data', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: null })) }
    expect(await getCreatorPayoutBatches(supabase as never)).toEqual([])
  })

  it('propagates an RPC error', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: 'forbidden' } })) }
    await expect(getCreatorPayoutBatches(supabase as never)).rejects.toEqual({ message: 'forbidden' })
  })
})

describe('summarizeSettledEarnings', () => {
  it('buckets by currency and sorts alphabetically', () => {
    const totals = summarizeSettledEarnings(
      [
        { id: 'a', missionTitle: '', missionType: '', missionSource: '', currency: 'USD', amount: 10, payoutStatus: 'paid' },
        { id: 'b', missionTitle: '', missionType: '', missionSource: '', currency: 'HKD', amount: 5, payoutStatus: 'pending' },
      ],
      [{ id: 'c', experienceTitle: '', currency: 'HKD', amount: 2, payoutStatus: 'paid' }],
    )
    expect(totals).toEqual([
      { currency: 'HKD', paid: 2, pending: 5 },
      { currency: 'USD', paid: 10, pending: 0 },
    ])
  })

  it('treats any non-paid status as pending', () => {
    const totals = summarizeSettledEarnings(
      [{ id: 'a', missionTitle: '', missionType: '', missionSource: '', currency: 'HKD', amount: 7, payoutStatus: 'pending' }],
      [],
    )
    expect(totals).toEqual([{ currency: 'HKD', paid: 0, pending: 7 }])
  })
})
