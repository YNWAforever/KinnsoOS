import { describe, expect, it, vi } from 'vitest'
import { getMissionsOverview } from '@/lib/admin/missions-queries'

function makeSupabase(payload: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: payload, error })) } as never
}

describe('getMissionsOverview', () => {
  it('maps the analytics payload from snake_case to camelCase', async () => {
    const supabase = makeSupabase({
      kpis: {
        total: 6,
        by_status: { published: 4, draft: 1, paused: 1 },
        by_type: { coupon_affiliate: 3, hybrid: 2, paid: 1 },
        by_visibility: { open: 5, targeted: 1 },
        open_for_applications: 4,
        submissions_awaiting_review: 2,
      },
      missions_created: [{ day: '2026-07-01', count: 2 }],
      submissions_reviewed: [{ day: '2026-07-01', count: 1 }],
      at_risk: [{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchant_name: 'Sunrise Stays HK', reason: 'stalled_submissions' }],
    })
    const result = await getMissionsOverview(supabase)
    expect(result.kpis.total).toBe(6)
    expect(result.kpis.byStatus).toEqual({ published: 4, draft: 1, paused: 1 })
    expect(result.kpis.byType).toEqual({ coupon_affiliate: 3, hybrid: 2, paid: 1 })
    expect(result.kpis.openForApplications).toBe(4)
    expect(result.kpis.submissionsAwaitingReview).toBe(2)
    expect(result.missionsCreated).toEqual([{ day: '2026-07-01', count: 2 }])
    expect(result.submissionsReviewed).toEqual([{ day: '2026-07-01', count: 1 }])
    expect(result.atRisk).toEqual([{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchantName: 'Sunrise Stays HK', reason: 'stalled_submissions' }])
  })

  it('defaults missing arrays to empty and missing maps to {}', async () => {
    const supabase = makeSupabase({
      kpis: { total: 0, open_for_applications: 0, submissions_awaiting_review: 0 },
    })
    const result = await getMissionsOverview(supabase)
    expect(result.kpis.byStatus).toEqual({})
    expect(result.kpis.byType).toEqual({})
    expect(result.kpis.byVisibility).toEqual({})
    expect(result.missionsCreated).toEqual([])
    expect(result.submissionsReviewed).toEqual([])
    expect(result.atRisk).toEqual([])
  })

  it('propagates RPC errors', async () => {
    const supabase = makeSupabase(null, new Error('forbidden'))
    await expect(getMissionsOverview(supabase)).rejects.toThrow('forbidden')
  })

  it('throws when the RPC returns no data and no error', async () => {
    const supabase = makeSupabase(null, null)
    await expect(getMissionsOverview(supabase)).rejects.toThrow('admin_mission_analytics returned no data')
  })
})
