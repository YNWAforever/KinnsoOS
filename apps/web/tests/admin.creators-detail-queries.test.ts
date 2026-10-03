import { describe, expect, it, vi } from 'vitest'
import { getCreatorDetail } from '@/lib/admin/creators-queries'

function clientReturning(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) } as never
}

const payload = {
  creator: {
    id: 'c1', display_name: 'Mia', handle: 'mia', status: 'active', verified: true, is_listed: false,
    bio: 'Travel creator', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  contribution: { points: 320, tier: 'pro', tier_updated_at: '2026-06-10T00:00:00Z' },
  dna: { id: 'd1', status: 'published', model: 'gpt', draft_ready_at: null, updated_at: '2026-06-05T00:00:00Z' },
  scan: { id: 'j1', status: 'completed', error: null, started_at: null, completed_at: '2026-06-04T00:00:00Z', created_at: '2026-06-04T00:00:00Z' },
  socials: [{ platform: 'instagram', handle: 'mia', url: 'https://ig/mia' }],
  missions: [{ participant_id: 'p1', mission_id: 'm1', title: 'Tokyo eats', status: 'active', source: 'applied', approved_at: null, created_at: '2026-06-02T00:00:00Z', submissions_total: 3, submissions_approved: 1, submissions_pending: 2 }],
  settlements: [{ id: 's1', mission_title: 'Tokyo eats', status: 'pending', creator_payout_status: 'pending', creator_commission_amount: 120.5, amount_currency: 'HKD', created_at: '2026-06-03T00:00:00Z' }],
  points_events: [{ id: 'e1', event_type: 'guide_published', points: 50, created_at: '2026-06-06T00:00:00Z' }],
  content: [{ id: 'g1', title: 'Best ramen', slug: 'best-ramen', status: 'published', saves_count: 12, published_at: '2026-06-07T00:00:00Z', created_at: '2026-06-06T00:00:00Z' }],
}

describe('getCreatorDetail', () => {
  it('maps the RPC payload to a camelCase CreatorDetail', async () => {
    const supabase = clientReturning(payload)
    const detail = await getCreatorDetail(supabase, 'c1')
    expect(detail).not.toBeNull()
    expect(detail!.creator).toMatchObject({ id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true, isListed: false })
    expect(detail!.contribution).toMatchObject({ points: 320, tier: 'pro' })
    expect(detail!.dna).toMatchObject({ status: 'published' })
    expect(detail!.scan).toMatchObject({ status: 'completed' })
    expect(detail!.socials[0]).toMatchObject({ platform: 'instagram', handle: 'mia' })
    expect(detail!.missions[0]).toMatchObject({ participantId: 'p1', title: 'Tokyo eats', status: 'active', submissionsTotal: 3, submissionsApproved: 1, submissionsPending: 2 })
    expect(detail!.settlements[0]).toMatchObject({ missionTitle: 'Tokyo eats', creatorCommissionAmount: 120.5, currency: 'HKD' })
    expect(detail!.pointsEvents[0]).toMatchObject({ eventType: 'guide_published', points: 50 })
    expect(detail!.content[0]).toMatchObject({ title: 'Best ramen', savesCount: 12 })
  })

  it('returns null when the creator is missing (RPC returns null)', async () => {
    const supabase = clientReturning(null)
    expect(await getCreatorDetail(supabase, 'nope')).toBeNull()
  })

  it('propagates errors (no silent null)', async () => {
    const supabase = clientReturning(null, new Error('boom'))
    await expect(getCreatorDetail(supabase, 'c1')).rejects.toThrow('boom')
  })

  it('propagates a forbidden error from an under-privileged caller (12C role gate)', async () => {
    const supabase = clientReturning(null, { message: 'forbidden' })
    await expect(getCreatorDetail(supabase, 'c1')).rejects.toMatchObject({ message: 'forbidden' })
  })

  it('tolerates null optional sections', async () => {
    const supabase = clientReturning({ ...payload, contribution: null, dna: null, scan: null })
    const detail = await getCreatorDetail(supabase, 'c1')
    expect(detail!.contribution).toBeNull()
    expect(detail!.dna).toBeNull()
    expect(detail!.scan).toBeNull()
  })
})
