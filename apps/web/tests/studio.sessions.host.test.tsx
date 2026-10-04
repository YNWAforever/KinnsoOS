// apps/web/tests/studio.sessions.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))

// The page now defers to the central guard rather than re-deriving the role from
// auth.getUser(), so the guard is what these tests drive — the same pattern as
// studio.perks.host.test.tsx. Asserting the guard's own behaviour is
// admin.guard.test.ts's job; here we only care that the page delegates to it.
const { creatorPageGateMock, fromMock } = vi.hoisted(() => ({
  creatorPageGateMock: vi.fn(async () => ({ user: { id: 'creator-1' } })),
  fromMock: vi.fn(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) })),
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: creatorPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))

import StudioSessionsPage from '@/app/[locale]/studio/sessions/page'

beforeEach(() => {
  creatorPageGateMock.mockResolvedValue({ user: { id: 'creator-1' } })
  fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) })
})
afterEach(() => vi.clearAllMocks())

describe('/studio/sessions host', () => {
  it('redirects anon to sign-in', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/sign-in'))
    await expect(StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('sends a not-yet-active creator to onboarding instead of an empty creator UI', async () => {
    // A blank `creators` row exists for every sign-up, so a session alone is not
    // a creator. This page used to show such a viewer an empty session list.
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/creator'))
    await expect(StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/creator')
  })

  it('asks the guard for the creator-onboarding denial, not a 404', async () => {
    await StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(creatorPageGateMock).toHaveBeenCalledWith(expect.anything(), 'en', 'creator')
  })

  it("scopes the query to the signed-in creator's own sessions", async () => {
    const eqMock = vi.fn(() => ({ order: async () => ({ data: [], error: null }) }))
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqMock }) })
    await StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(eqMock).toHaveBeenCalledWith('host_creator_id', 'creator-1')
  })

  it('renders the empty state for a creator with no sessions yet', async () => {
    const ui = await StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /New session/ })).toBeTruthy()
  })
})
