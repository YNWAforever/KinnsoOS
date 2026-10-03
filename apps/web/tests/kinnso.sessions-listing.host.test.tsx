// apps/web/tests/kinnso.sessions-listing.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getUpcomingSessionsListMock, getReplaySessionsMock } = vi.hoisted(() => ({
  getUpcomingSessionsListMock: vi.fn(async (): Promise<import('@/lib/sessions/public-queries').PublicSession[]> => []),
  getReplaySessionsMock: vi.fn(async (): Promise<import('@/lib/sessions/public-queries').PublicSession[]> => []),
}))
vi.mock('@/lib/sessions/public-queries', () => ({
  getUpcomingSessionsList: getUpcomingSessionsListMock,
  getReplaySessions: getReplaySessionsMock,
}))

import SessionsPage from '@/app/[locale]/sessions/page'
import { MARKETING_PATHS } from '@/lib/seo/routes'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/sessions listing host', () => {
  it('is a real public page now, in MARKETING_PATHS', () => {
    expect(MARKETING_PATHS).toContain('/sessions')
  })

  it('renders value framing and the waitlist only when upcoming sessions and replays are both empty', async () => {
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Live sessions turn practical travel questions into honest answers you can use right away.')).toBeTruthy()
    expect(screen.getByText('No pressure—join the waitlist for a quiet heads-up when the next one is ready.')).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Session updates' })).toBeTruthy()
  })

  it('renders upcoming sessions linking to their detail page without the waitlist', async () => {
    getUpcomingSessionsListMock.mockResolvedValueOnce([{
      id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
      type: 'ask_a_creator', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: null, replayUrl: null, destinationTags: ['Tokyo'], status: 'scheduled',
      host: { handle: 'sora', displayName: 'Sora' },
    }])
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /Tokyo ramen AMA/ }).getAttribute('href')).toBe('/en/sessions/tokyo-ramen-ama')
    expect(screen.queryByRole('form', { name: 'Session updates' })).toBeNull()
  })

  it('keeps the existing replay listing and plain upcoming copy without the waitlist', async () => {
    getReplaySessionsMock.mockResolvedValueOnce([{
      id: 's2', slug: 'kyoto-temples-recap', title: 'Kyoto temples recap', description: 'The replay.',
      type: 'destination_briefing', startsAt: '2026-12-01T09:00:00.000Z', durationMinutes: 30,
      embedUrl: null, replayUrl: 'https://youtu.be/xyz', destinationTags: ['Kyoto'], status: 'ended',
      host: { handle: 'nina', displayName: 'Nina' },
    }])
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.sessions.replaysHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Kyoto temples recap/ }).getAttribute('href')).toBe('/en/sessions/kyoto-temples-recap')
    expect(screen.getByText(en.sessions.emptyUpcoming)).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Session updates' })).toBeNull()
  })

  it('404s unknown locales', async () => {
    await expect(SessionsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
