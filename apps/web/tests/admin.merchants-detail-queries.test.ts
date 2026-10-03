import { describe, expect, it, vi } from 'vitest'
import { getMerchantDetail } from '@/lib/admin/merchants-queries'

function clientReturning(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) } as never
}

const payload = {
  profile: {
    id: 'm1', company_name: 'Acme Co', contact_name: 'Pat', contact_email: 'pat@acme.test',
    website_url: 'https://acme.test', status: 'active', tier: 'growth',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  missions: [{ id: 'mi1', title: 'Tokyo eats', status: 'live', visibility: 'public', participants_count: 4, milestones_total: 3, milestones_approved: 1, created_at: '2026-06-02T00:00:00Z' }],
  creators: { engaged: [{ creator_id: 'c1', display_name: 'Mia', handle: 'mia', participant_status: 'active' }], saved_count: 7 },
  billing: {
    settlements: [{ id: 's1', mission_title: 'Tokyo eats', status: 'pending', creator_payout_status: 'pending', kinnso_commission_status: 'pending', affiliate_commission_status: null, currency: 'HKD', creator_payout_amount: 120.5, updated_at: '2026-06-03T00:00:00Z' }],
    owed: [{ currency: 'HKD', amount: 120.5 }, { currency: 'JPY', amount: 9000 }],
    settled: [{ currency: 'HKD', amount: 50 }],
  },
}

describe('getMerchantDetail', () => {
  it('maps the RPC payload to a camelCase MerchantDetail', async () => {
    const supabase = clientReturning(payload)
    const detail = await getMerchantDetail(supabase, 'm1')
    expect(detail).not.toBeNull()
    expect(detail!.profile).toMatchObject({ id: 'm1', companyName: 'Acme Co', contactName: 'Pat', contactEmail: 'pat@acme.test', status: 'active', tier: 'growth' })
    expect(detail!.missions[0]).toMatchObject({ id: 'mi1', title: 'Tokyo eats', participantsCount: 4, milestonesTotal: 3, milestonesApproved: 1 })
    expect(detail!.creators.engaged[0]).toMatchObject({ creatorId: 'c1', displayName: 'Mia', participantStatus: 'active' })
    expect(detail!.creators.savedCount).toBe(7)
    expect(detail!.billing.settlements[0]).toMatchObject({ missionTitle: 'Tokyo eats', creatorPayoutAmount: 120.5, currency: 'HKD' })
    // per-currency honesty: arrays preserved, never collapsed/summed
    expect(detail!.billing.owed).toEqual([{ currency: 'HKD', amount: 120.5 }, { currency: 'JPY', amount: 9000 }])
    expect(detail!.billing.settled).toEqual([{ currency: 'HKD', amount: 50 }])
  })

  it('returns null when the merchant is missing (RPC returns null)', async () => {
    const supabase = clientReturning(null)
    expect(await getMerchantDetail(supabase, 'nope')).toBeNull()
  })

  it('propagates errors (no silent null)', async () => {
    const supabase = clientReturning(null, new Error('boom'))
    await expect(getMerchantDetail(supabase, 'm1')).rejects.toThrow('boom')
  })

  it('propagates a forbidden error from an under-privileged caller (12C role gate)', async () => {
    const supabase = clientReturning(null, { message: 'forbidden' })
    await expect(getMerchantDetail(supabase, 'm1')).rejects.toMatchObject({ message: 'forbidden' })
  })

  it('tolerates empty sections', async () => {
    const supabase = clientReturning({ ...payload, missions: [], creators: { engaged: [], saved_count: 0 }, billing: { settlements: [], owed: [], settled: [] } })
    const detail = await getMerchantDetail(supabase, 'm1')
    expect(detail!.missions).toEqual([])
    expect(detail!.creators.engaged).toEqual([])
    expect(detail!.billing.owed).toEqual([])
  })
})
