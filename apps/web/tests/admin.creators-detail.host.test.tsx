// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { guardMock, detailMock, auditMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  guardMock: vi.fn(), detailMock: vi.fn(), auditMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirectMock: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/admin/creators/c1',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsPage: guardMock }))
vi.mock('@/lib/admin/creators-queries', () => ({ getCreatorDetail: detailMock }))
vi.mock('@/lib/admin/audit', () => ({ listAudit: auditMock }))
vi.mock('@/lib/i18n/dictionaries', () => ({ getDictionary: vi.fn(async () => (await import('@/lib/i18n/messages/en')).default) }))
vi.mock('@/lib/admin/creators-actions', () => ({ setCreatorStatus: vi.fn(), reinstateCreator: vi.fn(), setCreatorVerified: vi.fn(), setCreatorListed: vi.fn(), addCreatorNote: vi.fn() }))

import CreatorDetailPage from '@/app/[locale]/admin/creators/[creatorId]/page'

afterEach(() => { vi.clearAllMocks() })

const params = (creatorId = 'c1', locale = 'en') => Promise.resolve({ locale, creatorId })

describe('Creator 360 page gate', () => {
  it('invalid locale → notFound', async () => {
    await expect(CreatorDetailPage({ params: params('c1', 'xx') })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('missing creator → notFound', async () => {
    guardMock.mockResolvedValueOnce(undefined)
    detailMock.mockResolvedValueOnce(null)
    await expect(CreatorDetailPage({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('ops + found → renders the view', async () => {
    guardMock.mockResolvedValueOnce(undefined)
    detailMock.mockResolvedValueOnce({
      creator: { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: false, isListed: false, bio: null, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
      contribution: null, dna: null, scan: null, socials: [], missions: [], settlements: [], pointsEvents: [], content: [],
    })
    auditMock.mockResolvedValueOnce([])
    const ui = await CreatorDetailPage({ params: params() })
    render(ui)
    expect(screen.getByRole('heading', { name: 'Mia' })).toBeTruthy()
  })
})
