// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notifications = [
  {
    id: 'n1', notificationType: 'payout_batch.paid', entityType: 'payout_batch', entityId: 'b1',
    payload: { currency: 'HKD', amount: 1500 }, readAt: null, createdAt: '2026-08-17T00:00:00Z',
  },
]

const { getNotificationsMock, requireCreatorPageMock } = vi.hoisted(() => ({
  getNotificationsMock: vi.fn(async () => [] as unknown[]),
  requireCreatorPageMock: vi.fn(async () => ({ user: { id: 'c1' } })),
}))
vi.mock('@/lib/notifications/queries', () => ({ getNotifications: getNotificationsMock }))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: requireCreatorPageMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))

import StudioInboxPage from '@/app/[locale]/studio/inbox/page'

beforeEach(() => {
  getNotificationsMock.mockClear().mockResolvedValue(notifications)
  requireCreatorPageMock.mockClear()
})
afterEach(cleanup)

describe('/[locale]/studio/inbox host', () => {
  it('renders the inbox for an active creator, with the payload interpolated into the notification text', async () => {
    const ui = await StudioInboxPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(getNotificationsMock).toHaveBeenCalled()
    expect(requireCreatorPageMock).toHaveBeenCalled()
    expect(screen.getByText('Inbox')).toBeTruthy()
    expect(screen.getByRole('link').textContent).toContain('Your payout of 1500 HKD has been paid')
  })

  it('shows the empty state when the creator has no notifications', async () => {
    getNotificationsMock.mockResolvedValue([])
    const ui = await StudioInboxPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText("You're all caught up.")).toBeTruthy()
  })
})
