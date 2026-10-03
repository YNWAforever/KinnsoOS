// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, overviewMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  overviewMock: vi.fn(async () => ({
    kpis: { total: 9, byStatus: { active: 6 }, byTier: { free: 5, growth: 4 }, newInPeriod: 2, newPrevPeriod: 1, missionsLive: 3, settlementsPending: 4, owed: [], settled: [] },
    signups: [], missionsCreated: [], leaderboard: [], atRisk: [], recentActivity: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  usePathname: () => '/en/admin/merchants',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/merchants-queries', () => ({ getMerchantsOverview: overviewMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MerchantsOverviewPage from '@/app/[locale]/admin/merchants/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin merchants overview host', () => {
  it('renders the overview for an ops user', async () => {
    const ui = await MerchantsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('9')).toBeTruthy()
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    await expect(MerchantsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MerchantsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an unknown locale', async () => {
    await expect(MerchantsOverviewPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
