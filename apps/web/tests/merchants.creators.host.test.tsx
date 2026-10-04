// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { merchantPageGateMock, fromMock, searchMock, savedMock, missionsMock } = vi.hoisted(() => ({
  merchantPageGateMock: vi.fn(async () => ({ user: { id: 'u1' }, merchantId: 'mp1' })),
  // merchant_profiles (tier) lookup + mission_participants working-set lookup
  fromMock: vi.fn(),
  searchMock: vi.fn(async () => [
    {
      id: 'c-ada',
      handle: 'ada',
      name: 'Ada',
      bio: '',
      niches: ['food'],
      audienceGeos: ['HK'],
      languages: ['en'],
      platforms: ['instagram'],
      guideCount: 2,
      lastGuideAt: '2026-06-01T00:00:00Z',
    },
  ]),
  savedMock: vi.fn(async () => []),
  missionsMock: vi.fn(async () => [{ id: 'm1', title: 'Summer brief' }]),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: merchantPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ from: fromMock }),
}))
vi.mock('@/lib/merchants/creator-search', () => ({
  searchPublicCreators: searchMock,
  deriveFacets: () => ({ niches: ['food'], audienceGeos: ['HK'], languages: ['en'], platforms: ['instagram'] }),
}))
vi.mock('@/lib/merchants/saved', () => ({ listSavedCreators: savedMock }))
vi.mock('@/lib/merchants/invite', () => ({ listMerchantPublishedMissions: missionsMock }))

import MerchantsCreatorsPage from '@/app/[locale]/merchants/dashboard/creators/page'
import en from '@/lib/i18n/messages/en'

// A merchant_profiles row carrying id + tier; the merchant has no missions, so
// the derived working set + invite usage resolve empty.
function wireQueries() {
  fromMock.mockImplementation((table: string) => {
    if (table === 'merchant_profiles') {
      return {
        select: () => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () => ({ data: column === 'id' && value === 'mp1' ? { tier: 'growth' } : null }),
          }),
        }),
      }
    }
    if (table === 'missions') {
      return { select: () => ({ eq: () => ({ data: [], error: null }) }) }
    }
    if (table === 'mission_participants') {
      return { select: () => ({ in: () => ({ data: [], error: null }) }) }
    }
    return { select: () => ({ data: [], error: null }) }
  })
}

beforeEach(() => {
  merchantPageGateMock.mockReset()
  merchantPageGateMock.mockResolvedValue({ user: { id: 'u1' }, merchantId: 'mp1' })
  wireQueries()
})

describe('/[locale]/merchants/dashboard/creators host', () => {
  it('renders the search surface for a merchant viewer', async () => {
    const ui = await MerchantsCreatorsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.merchantSearch.heading })).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
  })

  it('notFounds for a non-merchant signed-in viewer', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('notFound'))
    await expect(
      MerchantsCreatorsPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('notFound')
  })

  it('redirects an anonymous viewer to sign-in', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('redirect:/en/sign-in'))
    await expect(
      MerchantsCreatorsPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('redirect:/en/sign-in')
  })
})
