// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, overviewMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  overviewMock: vi.fn(async () => ({ creators: 5, merchants: 2, ops: 1, perksActive: 4, perksTotal: 6, redemptions: 9 })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/queries', () => ({ getAdminOverview: overviewMock }))
vi.mock('@/components/kinnso/admin/AdminShell', () => ({ AdminShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import AdminLayout from '@/app/[locale]/admin/layout'
import AdminDashboardPage from '@/app/[locale]/admin/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin layout + dashboard host', () => {
  it('layout notFounds for non-ops', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminLayout({ children: <p>x</p>, params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('layout renders the shell + children for ops', async () => {
    const ui = await AdminLayout({ children: <p>kid</p>, params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('shell')).toBeTruthy()
    expect(screen.getByText('kid')).toBeTruthy()
  })
  it('dashboard renders overview counts', async () => {
    const ui = await AdminDashboardPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('5')).toBeTruthy()
  })
  it('dashboard notFounds for non-ops (page gates independently of the layout)', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminDashboardPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
