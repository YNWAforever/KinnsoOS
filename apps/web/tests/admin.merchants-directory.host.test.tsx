// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, dirMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  dirMock: vi.fn(async () => ({
    rows: [{ id: 'm1', companyName: 'Acme Co', status: 'active', tier: 'growth', createdAt: '2026-06-30T00:00:00Z' }],
    nextCursor: null,
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/admin/merchants/directory',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/merchants-queries', () => ({ listMerchantsDirectory: dirMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MerchantsDirectoryPage from '@/app/[locale]/admin/merchants/directory/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); dirMock.mockClear() })

describe('admin merchants directory host', () => {
  it('renders the directory for ops and forwards normalized filters', async () => {
    const ui = await MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ q: 'acme', status: 'active' }) })
    render(ui)
    expect(screen.getByText('Acme Co')).toBeTruthy()
    expect(dirMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ search: 'acme', statuses: ['active'] }))
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an invalid locale', async () => {
    await expect(MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'xx' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
