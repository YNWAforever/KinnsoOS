// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
afterEach(cleanup)

const { roleMock, getUserMock, listMock } = vi.hoisted(() => ({
  roleMock:    vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  listMock:    vi.fn(async () => ([
    { id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00Z' },
  ])),
}))
vi.mock('next/navigation', () => ({
  notFound:     () => { throw new Error('NEXT_NOT_FOUND') },
  redirect:     (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter:    () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname:  () => '/en/admin/team',
}))
vi.mock('@/lib/auth/viewer-role',  () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/team-queries', () => ({
  getTeamMembers:  listMock,
  getTeamOverview: vi.fn(async () => ({ members: [{ id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00Z' }], byRole: { owner: 1, admin: 0, moderator: 0, analyst: 0 }, pendingInvites: 0 })),
}))
vi.mock('@/lib/admin/team-actions', () => ({
  inviteMemberAction:     vi.fn(),
  setMemberRoleAction:    vi.fn(),
  suspendMemberAction:    vi.fn(),
  reactivateMemberAction: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))

import TeamPage      from '@/app/[locale]/admin/team/page'
import DirectoryPage from '@/app/[locale]/admin/team/directory/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops')
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('Team Overview page', () => {
  it('renders heading for ops user', async () => {
    const ui = await TeamPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy()
  })
  it('redirects anon', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(TeamPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds non-ops', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(TeamPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('notFounds bad locale', async () => {
    await expect(TeamPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('Team Directory page', () => {
  it('renders Alice in the directory', async () => {
    const ui = await DirectoryPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Alice')).toBeTruthy()
  })
  it('redirects anon', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(DirectoryPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
