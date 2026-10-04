// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { merchantPageGateMock } = vi.hoisted(() => ({
  merchantPageGateMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'm1' }, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: merchantPageGateMock }))
vi.mock('@/lib/experiences/queries', () => ({
  listMyExperiences: vi.fn(async () => ([{
    id: 'e1', slug: 'sunset-tour-abc123', title: 'Sunset tour', city: 'Hong Kong',
    priceAmount: 480, currency: 'HKD', status: 'draft', updatedAt: '2026-07-04T00:00:00Z',
  }])),
  getMyExperience: vi.fn(),
}))

import MerchantDashboardHomePage from '@/app/[locale]/merchants/dashboard/page'
import MerchantExperiencesPage from '@/app/[locale]/merchants/dashboard/experiences/page'
import { listMyExperiences } from '@/lib/experiences/queries'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MerchantDashboardHomePage', () => {
  it('redirects anon to sign-in', async () => {
    merchantPageGateMock.mockRejectedValue(new Error('redirect:/en/sign-in'))
    await expect(MerchantDashboardHomePage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('redirect:/en/sign-in')
  })

  it('notFound for non-merchant viewers', async () => {
    merchantPageGateMock.mockRejectedValue(new Error('notFound'))
    await expect(MerchantDashboardHomePage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('notFound')
  })

  it('renders all six cards with dashboard-prefixed links for merchants', async () => {
    merchantPageGateMock.mockResolvedValue({ user: { id: 'u1' }, merchantId: 'm1' })
    const el = await MerchantDashboardHomePage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    for (const href of [
      '/en/merchants/dashboard/post',
      '/en/merchants/dashboard/missions',
      '/en/merchants/dashboard/creators',
      '/en/merchants/dashboard/insights',
      '/en/merchants/dashboard/experiences',
      '/en/merchants/dashboard/profile',
    ]) {
      expect(hrefs).toContain(href)
    }
    for (const title of [
      en.merchantDashboard.cardPostTitle,
      en.merchantDashboard.cardExperiencesTitle,
      en.merchantDashboard.cardProfileTitle,
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeTruthy()
    }
  })
})

describe('MerchantExperiencesPage', () => {
  it('lists the merchant experiences with an edit link and publish action', async () => {
    merchantPageGateMock.mockResolvedValue({ user: { id: 'u1' }, merchantId: 'm1' })
    const el = await MerchantExperiencesPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText('Sunset tour')).toBeTruthy()
    const edit = screen.getByRole('link', { name: en.merchantDashboard.actEdit })
    expect(edit.getAttribute('href')).toBe('/en/merchants/dashboard/experiences/e1/edit')
    expect(screen.getByRole('button', { name: en.merchantDashboard.actPublish })).toBeTruthy()
    expect(listMyExperiences).toHaveBeenCalledWith(expect.anything(), 'm1')
  })
})
