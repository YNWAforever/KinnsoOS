// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionDetail } from '@/lib/admin/mission-review-queries'

const { roleMock, getUserMock, detailMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  detailMock: vi.fn(async (): Promise<MissionDetail | null> => ({
    mission: { id: 'mission-1', title: 'Summer Coupon Push', missionSource: 'travelpayouts', missionType: 'coupon_affiliate', status: 'published', merchantProfileId: null, autoApprovePolicy: 'off' },
    participants: [], milestones: [], submissions: [],
  })),
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
vi.mock('@/lib/admin/mission-review-queries', () => ({ getMissionDetail: detailMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MissionDetailPage from '@/app/[locale]/admin/missions/[missionId]/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); detailMock.mockClear() })
afterEach(cleanup)

describe('/[locale]/admin/missions/[missionId] host', () => {
  it('renders the detail page for ops', async () => {
    const ui = await MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'mission-1' }) })
    render(ui)
    expect(screen.getByText('Summer Coupon Push')).toBeTruthy()
    expect(detailMock).toHaveBeenCalledWith(expect.anything(), 'mission-1')
  })

  it('notFounds when the mission does not exist', async () => {
    detailMock.mockResolvedValueOnce(null)
    await expect(MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('notFounds a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'mission-1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the auto-approve policy toggle at its current value', async () => {
    const ui = await MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'mission-1' }) })
    render(ui)
    const select = screen.getByLabelText('Auto-approve verified submissions') as HTMLSelectElement
    expect(select.value).toBe('off')
  })
})
