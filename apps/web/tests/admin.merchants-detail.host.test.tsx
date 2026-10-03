// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, detailMock, auditMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  detailMock: vi.fn(async () => ({
    profile: { id: 'm1', companyName: 'Acme Co', contactName: null, contactEmail: null, websiteUrl: null, status: 'active', tier: 'free', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
    missions: [], creators: { engaged: [], savedCount: 0 }, billing: { settlements: [], owed: [], settled: [] },
  })),
  auditMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/merchants-queries', () => ({ getMerchantDetail: detailMock, getMerchantBudgetOps: vi.fn(async () => null) }))
vi.mock('@/lib/admin/audit', () => ({ listAudit: auditMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/lib/admin/merchants-actions', () => ({ setMerchantStatus: vi.fn(), setMerchantTier: vi.fn(), addMerchantNote: vi.fn() }))

import MerchantDetailPage from '@/app/[locale]/admin/merchants/[merchantId]/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
  detailMock.mockClear(); auditMock.mockClear()
})

const params = (merchantId = 'm1', locale = 'en') => Promise.resolve({ locale, merchantId })

describe('Merchant 360 page gate', () => {
  it('renders the view for ops when the merchant exists', async () => {
    const ui = await MerchantDetailPage({ params: params() })
    render(ui)
    expect(screen.getByRole('heading', { name: 'Acme Co' })).toBeTruthy()
  })
  it('notFounds when the merchant is missing', async () => {
    detailMock.mockResolvedValueOnce(null as never)
    await expect(MerchantDetailPage({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MerchantDetailPage({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MerchantDetailPage({ params: params() })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an invalid locale', async () => {
    await expect(MerchantDetailPage({ params: params('m1', 'xx') })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
