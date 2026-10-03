// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionAttention } from '@/lib/admin/missions-queries'

afterEach(cleanup)
const { roleMock, getUserMock, overviewMock, attentionMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  overviewMock: vi.fn(async () => ({
    kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
    missionsCreated: [], submissionsReviewed: [], atRisk: [],
  })),
  attentionMock: vi.fn(async (): Promise<MissionAttention> => ({ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  usePathname: () => '/en/admin/missions',
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/missions-queries', () => ({ getMissionsOverview: overviewMock, getMissionAttention: attentionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MissionsOverviewPage from '@/app/[locale]/admin/missions/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin missions overview host', () => {
  it('renders the overview for an ops user', async () => {
    const ui = await MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('6')).toBeTruthy()
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    await expect(MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an unknown locale', async () => {
    await expect(MissionsOverviewPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('renders the overdue-reviews list', async () => {
    attentionMock.mockResolvedValueOnce({
      overdueReviews: [{ submissionId: 's1', missionId: 'm1', missionTitle: 'Overdue Mission', creatorId: 'c1', reviewDeadline: '2026-08-01T00:00:00Z' }],
      atRiskMissions: [],
      redemptionVelocity: [],
    })
    const ui = await MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Overdue reviews')).toBeTruthy()
    expect(screen.getByText('Overdue Mission')).toBeTruthy()
  })
})
