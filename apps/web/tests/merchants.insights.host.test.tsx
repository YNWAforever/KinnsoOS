// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { merchantPageGateMock, insightsMock } = vi.hoisted(() => ({
  merchantPageGateMock: vi.fn(async () => ({ user: { id: 'u1' }, merchantId: 'mp1' })),
  insightsMock: vi.fn(async () => ({
    missionsPublished: 1,
    perMission: [{ missionId: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approvedSubmissions: 2 }],
    totals: { participants: 5, invited: 4, accepted: 2, approvedSubmissions: 2 },
    inviteAcceptRate: 0.5,
    visitsDriven: [{ creatorId: 'c1', creatorName: 'Amy Lee', guideId: 'g1', guideTitle: 'Taipei Night Market Crawl',
      redemptions: 3, attributedBookings: 2 }],
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: merchantPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({}),
}))
vi.mock('@/lib/insights/merchant', () => ({ getMerchantInsights: insightsMock }))

import MerchantsInsightsPage from '@/app/[locale]/merchants/dashboard/insights/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  merchantPageGateMock.mockReset()
  merchantPageGateMock.mockResolvedValue({ user: { id: 'u1' }, merchantId: 'mp1' })
})

describe('/[locale]/merchants/dashboard/insights host', () => {
  it('renders insights for a merchant', async () => {
    const ui = await MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.merchantTitle })).toBeTruthy()
  })

  it('notFounds for a non-merchant', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('notFound'))
    await expect(MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('notFound')
  })

  it('redirects an anonymous viewer to sign-in', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('redirect:/en/sign-in'))
    await expect(MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('redirect:/en/sign-in')
  })
})
