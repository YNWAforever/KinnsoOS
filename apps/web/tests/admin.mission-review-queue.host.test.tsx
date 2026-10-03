// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewQueueRow } from '@/lib/admin/mission-review-queries'

const { roleMock, getUserMock, queueMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  // Explicitly typed as ReviewQueueRow[] (not inferred) so mockResolvedValueOnce below can
  // supply a different confidenceStatus/status literal without TS narrowing to this row's.
  queueMock: vi.fn(async (): Promise<ReviewQueueRow[]> => [{
    submissionId: 's1', missionId: 'mission-1', missionTitle: 'Summer Coupon Push', missionType: 'coupon_affiliate',
    creatorId: 'creator-1', status: 'submitted', submittedAt: '2026-08-19T00:00:00Z',
    reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'verified_signal',
  }]),
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
vi.mock('@/lib/admin/mission-review-queries', () => ({ getReviewQueue: queueMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MissionReviewQueuePage from '@/app/[locale]/admin/missions/review/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); queueMock.mockClear() })
afterEach(cleanup)

describe('/[locale]/admin/missions/review host', () => {
  it('renders the queue for ops', async () => {
    const ui = await MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(queueMock).toHaveBeenCalled()
    // Proves the resolved rows actually reach the rendered output, not just that the
    // query was called (the page could silently drop the result before rendering).
    expect(screen.getByText('Summer Coupon Push')).toBeTruthy()
  })

  it('notFounds a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders a confidence badge and hides the re-run button for a verified_signal row', async () => {
    const ui = await MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.queryByText('Re-run verification')).toBeNull()
  })

  it('shows the re-run button for a needs_review row', async () => {
    queueMock.mockResolvedValueOnce([{
      submissionId: 's2', missionId: 'mission-2', missionTitle: 'Autumn Push', missionType: 'coupon_affiliate',
      creatorId: 'creator-2', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z',
      reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'needs_review' as const,
    }])
    const ui = await MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Needs review')).toBeTruthy()
    expect(screen.getByText('Re-run verification')).toBeTruthy()
  })
})
