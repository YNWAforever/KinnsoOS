import { describe, expect, it } from 'vitest'
import { getMissionAttention } from '@/lib/admin/missions-queries'

function fakeClient(payload: unknown, error: unknown = null) {
  return { rpc: async () => ({ data: payload, error }) } as never
}

describe('getMissionAttention', () => {
  it('maps overdue_reviews and at_risk_missions', async () => {
    const supabase = fakeClient({
      overdue_reviews: [{ submission_id: 's1', mission_id: 'm1', mission_title: 'Mission One', creator_id: 'c1', review_deadline: '2026-08-19T00:00:00Z' }],
      at_risk_missions: [{ id: 'm2', title: 'Mission Two', merchant_name: 'Acme', reason: 'stalled_submissions' }],
    })
    const result = await getMissionAttention(supabase)
    expect(result).toEqual({
      overdueReviews: [{ submissionId: 's1', missionId: 'm1', missionTitle: 'Mission One', creatorId: 'c1', reviewDeadline: '2026-08-19T00:00:00Z' }],
      atRiskMissions: [{ id: 'm2', title: 'Mission Two', merchantName: 'Acme', reason: 'stalled_submissions' }],
      redemptionVelocity: [],
    })
  })

  it('defaults missing arrays to empty when the RPC omits a key', async () => {
    const supabase = fakeClient({})
    const result = await getMissionAttention(supabase)
    expect(result).toEqual({ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] })
  })

  it('propagates an RPC error rather than swallowing it', async () => {
    const supabase = fakeClient(null, { message: 'boom' })
    await expect(getMissionAttention(supabase)).rejects.toEqual({ message: 'boom' })
  })

  it('throws when the RPC returns no data and no error', async () => {
    const supabase = fakeClient(null, null)
    await expect(getMissionAttention(supabase)).rejects.toThrow('admin_mission_attention returned no data')
  })
})
