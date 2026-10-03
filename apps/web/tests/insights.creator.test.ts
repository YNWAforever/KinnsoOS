import { describe, expect, it, vi } from 'vitest'
import { getCreatorInsights } from '@/lib/insights/creator'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const RAW = {
  points_total: 65,
  points_before_window: 25,
  points_by_type: { guide_published: 30, mission_verified: 40, dna_scan: 10 },
  points_trajectory: [
    { week_start: '2026-04-13', points: 15 },
    { week_start: '2026-06-08', points: 25 },
  ],
  guides_published: 2,
  guide_saves_total: 7,
  missions_by_status: { applied: 1, active: 1 },
  submissions_approved: 1,
}

describe('getCreatorInsights', () => {
  it('maps the RPC payload, derives tier, and builds a cumulative trajectory', async () => {
    const res = await getCreatorInsights(client(RAW))
    expect(res.pointsTotal).toBe(65)
    expect(res.pointsByType.mission_verified).toBe(40)
    expect(res.tier.tier).toBe('rising') // 65 >= 50
    expect(res.tier.pointsForNext).toBe(85) // 150 - 65
    // cumulative starts from points_before_window (25), then +15, +25
    expect(res.trajectory.map((p) => p.cumulative)).toEqual([40, 65])
    expect(res.missionsByStatus.active).toBe(1)
    expect(res.missionsByStatus.rejected).toBe(0) // missing key defaults to 0
    expect(res.submissionsApproved).toBe(1)
    expect(res.visitsDriven).toBe(0) // RAW has no visits_driven key -- defaults to 0
  })

  it('maps visits_driven through when present', async () => {
    const res = await getCreatorInsights(client({ ...RAW, visits_driven: 12 }))
    expect(res.visitsDriven).toBe(12)
  })

  it('throws when the RPC errors', async () => {
    await expect(getCreatorInsights(client(null, new Error('forbidden')))).rejects.toThrow('forbidden')
  })
})
