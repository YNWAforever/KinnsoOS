// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { listCreatorMerchantMissionsMock, notFoundMock, creatorPageGateMock } = vi.hoisted(() => ({
  listCreatorMerchantMissionsMock: vi.fn(async () => ({
    data: [{
      id: 'mission-1',
      title: 'Hybrid stay mission',
      summary: 'Post a reel and keep affiliate upside.',
      mission_source: 'merchant',
      mission_type: 'hybrid',
      status: 'published',
      merchant_profile_id: 'merchant-1',
      paid_fee_amount: 500,
      paid_fee_currency: 'HKD',
      affiliate_commission_rate: 12,
      creator_commission_rate: 8,
      affiliate_network_programs: null,
      mission_participants: [],
      affiliate_partner_links: [],
    }],
  })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  creatorPageGateMock: vi.fn(async () => ({ user: { id: 'creator-user-1' } })),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireCreatorPage: creatorPageGateMock,
}))

vi.mock('@/lib/missions/queries', () => ({
  listCreatorMerchantMissions: listCreatorMerchantMissionsMock,
}))

vi.mock('@/lib/contribution/queries', () => ({
  getCreatorStoredTier: vi.fn(async () => 'seed'),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }),
    },
    rpc: async () => ({ data: ['merchant-1'] }),
  }),
}))

import StudioMissionsPage from '@/app/[locale]/studio/missions/page'

beforeEach(() => {
  listCreatorMerchantMissionsMock.mockClear()
  creatorPageGateMock.mockReset()
  creatorPageGateMock.mockResolvedValue({ user: { id: 'creator-user-1' } })
})

describe('/[locale]/studio/missions host', () => {
  it('returns not found for authenticated non-creator viewers', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))

    await expect(
      StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(listCreatorMerchantMissionsMock).not.toHaveBeenCalled()
  })

  it('shows hybrid missions with both paid and affiliate compensation', async () => {
    const ui = await StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) })

    render(ui)

    expect(screen.getByText('Hybrid stay mission')).toBeTruthy()
    expect(screen.getByText('HKD 500 + Affiliate commission 8% creator / 12% total')).toBeTruthy()
    // merchant-1 is in the funded set returned by the rpc stub
    expect(screen.getByText('Funded')).toBeTruthy()
  })

  it('never badges a funded merchant\'s coupon mission — there is no fee to fund', async () => {
    // Same funded merchant (merchant-1 is in the rpc stub's set), but a coupon_affiliate
    // mission type: the badge gate in mapCreatorMission must reject it on mission_type
    // alone, so a refactor dropping the paid/hybrid clause fails this test.
    listCreatorMerchantMissionsMock.mockResolvedValueOnce({
      data: [{
        id: 'mission-2',
        title: 'Coupon push',
        summary: 'Share the code.',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        status: 'published',
        merchant_profile_id: 'merchant-1',
        paid_fee_amount: null,
        paid_fee_currency: null,
        affiliate_commission_rate: 12,
        creator_commission_rate: 8,
        affiliate_network_programs: null,
        mission_participants: [],
        affiliate_partner_links: [],
      }],
    } as never)

    const ui = await StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    expect(screen.getByText('Coupon push')).toBeTruthy()
    expect(screen.queryByText('Funded')).toBeNull()
  })

  it('shows Apply (not Join) and the Funded badge for a receipt_cashback mission', async () => {
    // receipt_cashback is a new mission_type (R12.2) that must NOT be silently coerced
    // to coupon_affiliate by the page's own mission-type mapper: it needs the same
    // "Apply" cta and funded-badge eligibility as paid/hybrid missions, since it is
    // budget-enforced via the same paid_fee_amount field.
    listCreatorMerchantMissionsMock.mockResolvedValueOnce({
      data: [{
        id: 'mission-3',
        title: 'Upload your receipt',
        summary: 'Snap a photo, get cashback.',
        mission_source: 'merchant',
        mission_type: 'receipt_cashback',
        status: 'published',
        merchant_profile_id: 'merchant-1',
        paid_fee_amount: 200,
        paid_fee_currency: 'HKD',
        affiliate_commission_rate: null,
        creator_commission_rate: null,
        affiliate_network_programs: null,
        mission_participants: [],
        affiliate_partner_links: [],
      }],
    } as never)

    const ui = await StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    expect(screen.getByText('Upload your receipt')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply mission' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Join mission' })).toBeNull()
    expect(screen.getByText('Funded')).toBeTruthy()
  })
})
