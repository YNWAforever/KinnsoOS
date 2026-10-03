// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, listMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  listMock: vi.fn(async () => ({
    creators: [{ id: 'c1', display_name: 'Ada', handle: 'ada', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
    merchants: [{ id: 'm1', company_name: 'Klook', status: 'active', tier: 'free', created_at: '2026-01-01T00:00:00Z' }],
    ops: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ refresh: () => {} }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/users-queries', () => ({ listAdminUsers: listMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import AdminUsersPage from '@/app/[locale]/admin/users/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin users page host', () => {
  it('notFounds for a non-ops viewer (page gates independently of the layout)', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminUsersPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('renders the users view for ops', async () => {
    const ui = await AdminUsersPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Ada')).toBeTruthy()
  })
  it('renders the merchant row as a link to its 360 (no inline tier control)', async () => {
    const ui = await AdminUsersPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    const link = screen.getByRole('link', { name: 'Klook' })
    expect(link.getAttribute('href')).toBe('/en/admin/merchants/m1')
    expect(screen.queryByLabelText('Tier Klook')).toBeNull()
  })
})
