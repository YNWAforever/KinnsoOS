// apps/web/tests/admin.sessions.host.test.tsx
// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { roleMock, getUserMock, listSessionsMock, listCreatorsMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
  listSessionsMock: vi.fn(async () => []),
  listCreatorsMock: vi.fn(async () => []),
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
vi.mock('@/lib/admin/sessions-queries', () => ({ listAllSessions: listSessionsMock, listCreatorsForHostPicker: listCreatorsMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/components/kinnso/admin/AdminSessionsView', () => ({ AdminSessionsView: () => <div data-testid="admin-sessions-view" /> }))

import AdminSessionsPage from '@/app/[locale]/admin/sessions/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops')
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
})

describe('/admin/sessions host', () => {
  it('notFounds for a non-ops viewer', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminSessionsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects anon to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(AdminSessionsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('renders the sessions view for ops, fetching both sessions and the host-picker list', async () => {
    const ui = await AdminSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(ui).toBeTruthy()
    expect(listSessionsMock).toHaveBeenCalled()
    expect(listCreatorsMock).toHaveBeenCalled()
  })
})
