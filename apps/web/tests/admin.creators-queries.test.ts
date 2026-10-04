import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/admin/audit', () => ({
  listRecentAudit: vi.fn(async () => [
    { id: 'a1', entityType: 'creator', entityId: 'c1', action: 'note.add', reason: 'hi', metadata: {}, createdAt: '2026-06-28T00:00:00Z' },
  ]),
}))

import { getCreatorsOverview, getSettlementsQueue } from '@/lib/admin/creators-queries'

function fakeSettlements(rows: unknown[], error: unknown = null) {
  return {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: rows, error }) }) }),
  } as never
}

const SETTLEMENT_ROWS = [
  { id: 's1', status: 'pending', creator_payout_status: 'pending', kinnso_commission_status: 'pending',
    affiliate_commission_status: null, amount_currency: 'USD', creator_commission_amount: 100,
    kinnso_commission_amount: 10, affiliate_commission_amount: null, paid_fee_amount: null, ops_note: null,
    missions: { id: 'm1', title: 'Mission One' }, mission_participants: { id: 'p1', creator_id: 'c1', status: 'active' } },
  { id: 's2', status: 'paid', creator_payout_status: 'paid', kinnso_commission_status: 'paid',
    affiliate_commission_status: 'paid', amount_currency: 'USD', creator_commission_amount: 50,
    kinnso_commission_amount: 5, affiliate_commission_amount: 5, paid_fee_amount: null, ops_note: 'done',
    missions: { id: 'm2', title: 'Mission Two' }, mission_participants: { id: 'p2', creator_id: 'c2', status: 'completed' } },
  { id: 's3', status: 'disputed', creator_payout_status: 'pending', kinnso_commission_status: null,
    affiliate_commission_status: null, amount_currency: 'HKD', creator_commission_amount: 80,
    kinnso_commission_amount: null, affiliate_commission_amount: null, paid_fee_amount: null, ops_note: null,
    missions: { id: 'm3', title: 'Mission Three' }, mission_participants: null },
]

describe('getSettlementsQueue', () => {
  it('maps rows and groups by status with honest per-currency money flow', async () => {
    const q = await getSettlementsQueue(fakeSettlements(SETTLEMENT_ROWS), {})
    expect(q.rows).toHaveLength(3)
    expect(q.rows[0]).toMatchObject({ id: 's1', missionTitle: 'Mission One', creatorId: 'c1', status: 'pending', creatorPayoutStatus: 'pending', creatorCommissionAmount: 100, currency: 'USD' })
    expect(q.summary.total).toBe(3)
    expect(q.summary.byStatus).toMatchObject({ pending: 1, paid: 1, disputed: 1 })
    expect(q.summary.owed).toEqual(expect.arrayContaining([{ currency: 'USD', amount: 100 }, { currency: 'HKD', amount: 80 }]))
    expect(q.summary.settled).toEqual([{ currency: 'USD', amount: 50 }])
  })
  it('filters returned rows by overall status while the summary stays full-queue', async () => {
    const q = await getSettlementsQueue(fakeSettlements(SETTLEMENT_ROWS), { status: 'disputed' })
    expect(q.rows.map((r) => r.id)).toEqual(['s3'])
    expect(q.summary.total).toBe(3)
  })
  it('propagates query errors (never swallows to empty)', async () => {
    await expect(getSettlementsQueue(fakeSettlements(null as never, { message: 'boom' }), {})).rejects.toBeTruthy()
  })
  it('returns honest zeros on an empty queue', async () => {
    const q = await getSettlementsQueue(fakeSettlements([]), {})
    expect(q.rows).toEqual([])
    expect(q.summary).toMatchObject({ total: 0, byStatus: {}, owed: [], settled: [] })
  })
})

describe('settlement source facet', () => {
  const rows = [
    {
      id: 's-aff', status: 'pending', creator_payout_status: 'pending',
      kinnso_commission_status: 'pending', affiliate_commission_status: 'pending',
      amount_currency: 'USD', creator_commission_amount: 7, kinnso_commission_amount: 3,
      affiliate_commission_amount: 10, paid_fee_amount: null, ops_note: null,
      missions: { title: 'Flight deals' }, mission_participants: { creator_id: 'c1' },
      affiliate_network_events: { id: 'ev1' },
    },
    {
      id: 's-fee', status: 'pending', creator_payout_status: 'pending',
      kinnso_commission_status: null, affiliate_commission_status: null,
      amount_currency: 'HKD', creator_commission_amount: null, kinnso_commission_amount: null,
      affiliate_commission_amount: null, paid_fee_amount: 1200, ops_note: null,
      missions: { title: 'Ramen crawl' }, mission_participants: { creator_id: 'c2' },
      affiliate_network_events: null,
    },
    {
      id: 's-man', status: 'pending', creator_payout_status: 'pending',
      kinnso_commission_status: null, affiliate_commission_status: null,
      amount_currency: 'HKD', creator_commission_amount: null, kinnso_commission_amount: null,
      affiliate_commission_amount: null, paid_fee_amount: null, ops_note: 'manual adjustment',
      missions: { title: 'Legacy row' }, mission_participants: { creator_id: 'c3' },
      affiliate_network_events: null,
    },
  ]

  it('labels each settlement by where it came from', async () => {
    const queue = await getSettlementsQueue(fakeSettlements(rows), {})
    expect(queue.rows.map((r) => [r.id, r.source])).toEqual([
      ['s-aff', 'affiliate'],
      ['s-fee', 'mission_fee'],
      ['s-man', 'manual'],
    ])
  })

  it('filters rows by source while leaving the summary over the full queue', async () => {
    const queue = await getSettlementsQueue(fakeSettlements(rows), { source: 'affiliate' })
    expect(queue.rows.map((r) => r.id)).toEqual(['s-aff'])
    expect(queue.summary.total).toBe(3)
  })

  it('combines the status and source facets', async () => {
    const queue = await getSettlementsQueue(fakeSettlements(rows), { status: 'pending', source: 'mission_fee' })
    expect(queue.rows.map((r) => r.id)).toEqual(['s-fee'])
  })
})

const analytics = {
  kpis: { total: 12, by_status: { onboarding: 2, active: 8, suspended: 2 }, new_in_period: 3, new_prev_period: 1, payouts_pending: 4 },
  signups: [{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }],
  engagement: [{ day: '2026-06-28', points: 40 }],
  leaderboard: [{ creator_id: 'c1', display_name: 'Mia', points: 320, tier: 'pro' }],
  at_risk: [{ creator_id: 'c2', display_name: 'Lee', reason: 'scan_failed' }],
}

/** Mocks supabase.rpc('admin_creator_analytics', { p_days }) → { data, error }. */
function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) }
}

describe('getCreatorsOverview', () => {
  it('maps the analytics jsonb + recent feed into a typed CreatorsOverview', async () => {
    const c = client(analytics)
    const o = await getCreatorsOverview(c as never, 30)
    expect(c.rpc).toHaveBeenCalledWith('admin_creator_analytics', { p_days: 30 })
    expect(o.kpis).toEqual({ total: 12, byStatus: { onboarding: 2, active: 8, suspended: 2 }, newInPeriod: 3, newPrevPeriod: 1, payoutsPending: 4 })
    expect(o.signups).toEqual([{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }])
    expect(o.engagement).toEqual([{ day: '2026-06-28', points: 40 }])
    expect(o.leaderboard).toEqual([{ creatorId: 'c1', displayName: 'Mia', points: 320, tier: 'pro' }])
    expect(o.atRisk).toEqual([{ creatorId: 'c2', displayName: 'Lee', reason: 'scan_failed' }])
    expect(o.recentActivity[0].action).toBe('note.add')
  })
  it('defaults missing status buckets and arrays to honest zeros/empties', async () => {
    const o = await getCreatorsOverview(client({ kpis: { total: 0, by_status: {}, new_in_period: 0, new_prev_period: 0, payouts_pending: 0 } }) as never, 30)
    expect(o.signups).toEqual([])
    expect(o.engagement).toEqual([])
    expect(o.leaderboard).toEqual([])
    expect(o.atRisk).toEqual([])
  })
  it('throws when the RPC errors (no silent zeros)', async () => {
    await expect(getCreatorsOverview(client(null, { message: 'forbidden' }) as never, 30)).rejects.toBeTruthy()
  })
})
