import { describe, expect, it, vi } from 'vitest'
import { getMerchantInsights } from '@/lib/insights/merchant'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const RAW = {
  missions_published: 2,
  per_mission: [
    { mission_id: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approved_submissions: 2 },
  ],
  totals: { participants: 5, invited: 4, accepted: 2, approved_submissions: 2 },
}

describe('getMerchantInsights', () => {
  it('maps the RPC payload and computes invite acceptance rate', async () => {
    const res = await getMerchantInsights(client(RAW))
    expect(res.missionsPublished).toBe(2)
    expect(res.perMission[0].approvedSubmissions).toBe(2)
    expect(res.totals.accepted).toBe(2)
    expect(res.inviteAcceptRate).toBeCloseTo(0.5) // 2 / 4
    expect(res.visitsDriven).toEqual([]) // RAW has no visits_driven key -- defaults to []
  })

  it('returns null acceptance rate when there are no invites', async () => {
    const res = await getMerchantInsights(client({ ...RAW, totals: { ...RAW.totals, invited: 0, accepted: 0 } }))
    expect(res.inviteAcceptRate).toBeNull()
  })

  it('maps visits_driven rows through, including creators/guides with no activity', async () => {
    const res = await getMerchantInsights(client({
      ...RAW,
      visits_driven: [
        { creator_id: 'c1', creator_name: 'Ada', guide_id: 'g1', guide_title: 'Best Ramen',
          redemptions: 3, attributed_bookings: 1 },
        { creator_id: 'c2', creator_name: null, guide_id: null, guide_title: null,
          redemptions: 0, attributed_bookings: 0 },
      ],
    }))
    expect(res.visitsDriven).toEqual([
      { creatorId: 'c1', creatorName: 'Ada', guideId: 'g1', guideTitle: 'Best Ramen',
        redemptions: 3, attributedBookings: 1 },
      { creatorId: 'c2', creatorName: null, guideId: null, guideTitle: null,
        redemptions: 0, attributedBookings: 0 },
    ])
  })

  it('throws when the RPC errors', async () => {
    await expect(getMerchantInsights(client(null, new Error('forbidden')))).rejects.toThrow('forbidden')
  })
})
