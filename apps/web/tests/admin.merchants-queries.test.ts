import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, auditMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  auditMock: vi.fn(async () => [{ id: 'a1', entityType: 'merchant', entityId: 'm1', action: 'status.set', reason: 'x', metadata: {}, createdAt: '2026-06-30T00:00:00Z' }]),
}))
vi.mock('@/lib/admin/audit', () => ({ listRecentAudit: auditMock }))

import { getMerchantsOverview } from '@/lib/admin/merchants-queries'

const okPayload = {
  kpis: { total: 4, by_status: { active: 3, paused: 1 }, by_tier: { free: 2, growth: 2 },
    new_in_period: 1, new_prev_period: 0, missions_live: 5, settlements_pending: 2,
    owed: [{ currency: 'HKD', amount: 100 }], settled: [{ currency: 'HKD', amount: 50 }] },
  signups: [{ day: '2026-06-29', count: 1 }],
  missions_created: [{ day: '2026-06-29', count: 2 }],
  leaderboard: [{ id: 'm1', company_name: 'Acme', tier: 'growth', missions_count: 5, creators_engaged: 3 }],
  at_risk: [{ id: 'm2', company_name: 'Idle Co', reason: 'growth_idle' }],
}
const client = { rpc: rpcMock } as never

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: okPayload, error: null })
  auditMock.mockClear()
})

describe('getMerchantsOverview', () => {
  it('calls admin_merchant_analytics and maps snake→camel', async () => {
    const o = await getMerchantsOverview(client, 30)
    expect(rpcMock).toHaveBeenCalledWith('admin_merchant_analytics', { p_days: 30 })
    expect(o.kpis.total).toBe(4)
    expect(o.kpis.byStatus.paused).toBe(1)
    expect(o.kpis.byTier.growth).toBe(2)
    expect(o.kpis.missionsLive).toBe(5)
    expect(o.kpis.owed).toEqual([{ currency: 'HKD', amount: 100 }])
    expect(o.signups).toEqual([{ day: '2026-06-29', count: 1 }])
    expect(o.missionsCreated).toEqual([{ day: '2026-06-29', count: 2 }])
    expect(o.leaderboard[0]).toEqual({ id: 'm1', companyName: 'Acme', tier: 'growth', missionsCount: 5, creatorsEngaged: 3 })
    expect(o.atRisk[0]).toEqual({ id: 'm2', companyName: 'Idle Co', reason: 'growth_idle' })
    expect(o.recentActivity).toHaveLength(1)
    expect(auditMock).toHaveBeenCalledWith(client, 'merchant', 20)
  })

  it('throws when the RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    await expect(getMerchantsOverview(client)).rejects.toBeTruthy()
  })

  it('defaults missing arrays to empty', async () => {
    rpcMock.mockResolvedValueOnce({ data: { ...okPayload, signups: undefined, leaderboard: undefined, at_risk: undefined, missions_created: undefined }, error: null })
    const o = await getMerchantsOverview(client)
    expect(o.signups).toEqual([])
    expect(o.leaderboard).toEqual([])
    expect(o.atRisk).toEqual([])
    expect(o.missionsCreated).toEqual([])
  })
})
