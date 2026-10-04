// apps/web/tests/kinnso.sessions-detail.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getSessionBySlugMock, getUserMock, rsvpMock } = vi.hoisted(() => ({
  getSessionBySlugMock: vi.fn(async (): Promise<import('@/lib/sessions/public-queries').PublicSession | null> => null),
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string; email?: string } | null } }> => ({ data: { user: null } })),
  rsvpMock: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/sessions/public-queries', () => ({ getSessionBySlug: getSessionBySlugMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/lib/sessions/rsvp-actions', () => ({ rsvpToSessionAction: rsvpMock }))

import SessionDetailPage from '@/app/[locale]/sessions/[slug]/page'
import en from '@/lib/i18n/messages/en'

const liveSession = {
  id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
  type: 'ask_a_creator' as const, startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
  embedUrl: 'https://youtu.be/abc123', replayUrl: null, destinationTags: ['Tokyo'],
  status: 'scheduled' as const, host: { handle: 'sora', displayName: 'Sora' },
}

describe('/[locale]/sessions/[slug] detail host', () => {
  it('404s when the session does not exist', async () => {
    await expect(
      SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the embed iframe for a scheduled session with an embed_url', async () => {
    getSessionBySlugMock.mockResolvedValueOnce(liveSession)
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('src')).toContain('youtube-nocookie.com/embed/abc123')
  })

  it('renders a replay iframe for an ended session with a replay_url instead of the live embed', async () => {
    getSessionBySlugMock.mockResolvedValueOnce({
      ...liveSession, status: 'ended', embedUrl: null, replayUrl: 'https://youtu.be/xyz789',
    })
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    expect(document.querySelector('iframe')?.getAttribute('src')).toContain('youtube-nocookie.com/embed/xyz789')
  })

  it('prefills the RSVP email input for a signed-in visitor', async () => {
    getSessionBySlugMock.mockResolvedValueOnce(liveSession)
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'traveller@example.com' } } })
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    expect(screen.getByLabelText(en.sessions.rsvpEmailLabel)).toHaveValue('traveller@example.com')
  })

  it('submits the RSVP form and shows a confirmation', async () => {
    getSessionBySlugMock.mockResolvedValueOnce(liveSession)
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    fireEvent.change(screen.getByLabelText(en.sessions.rsvpEmailLabel), { target: { value: 'me@example.com' } })
    fireEvent.click(screen.getByText(en.sessions.rsvpSubmit))
    await screen.findByText(en.sessions.rsvpConfirmed)
    expect(rsvpMock).toHaveBeenCalledWith('s1', 'me@example.com', '')
  })

  it('does not render the RSVP form for a cancelled session, showing a cancelled notice instead', async () => {
    getSessionBySlugMock.mockResolvedValueOnce({ ...liveSession, status: 'cancelled' })
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    expect(screen.getByText(en.sessions.rsvpCancelledNotice)).toBeTruthy()
    expect(screen.queryByLabelText(en.sessions.rsvpEmailLabel)).toBeNull()
  })
})
