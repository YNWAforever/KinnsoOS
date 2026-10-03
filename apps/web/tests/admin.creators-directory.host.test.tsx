// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, dirMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  dirMock: vi.fn(async () => ({
    rows: [{ id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: false, tier: 'pro', dnaStatus: 'published', contributionPoints: 5, createdAt: '2026-06-28T00:00:00Z' }],
    nextCursor: null,
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/admin/creators/directory',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/creators-queries', () => ({ listCreatorsDirectory: dirMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import CreatorsDirectoryPage from '@/app/[locale]/admin/creators/directory/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); dirMock.mockClear() })

describe('admin creators directory host', () => {
  it('renders the directory for ops and forwards normalized filters', async () => {
    const ui = await CreatorsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ q: 'mia', status: 'active', verified: 'true' }) })
    render(ui)
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(dirMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ search: 'mia', statuses: ['active'], verified: true }))
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(CreatorsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(CreatorsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
