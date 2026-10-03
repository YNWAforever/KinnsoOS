// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { creatorPageGateMock, getUserMock, tierMock, recentMock, countMock, configuredMock, dnaRow } = vi.hoisted(() => ({
  creatorPageGateMock: vi.fn(async () => ({ user: { id: 'creator-1' } })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'creator-1' } } })),
  tierMock: vi.fn(async () => 'rising'),
  recentMock: vi.fn(async () => []),
  countMock: vi.fn(async () => 0),
  configuredMock: vi.fn(() => true),
  dnaRow: { bio: 'b', niches: ['japan'], content_pillars: [], tone: [], audience: {}, platforms: [], languages: [] },
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: creatorPageGateMock }))
vi.mock('@/lib/contribution/queries', () => ({ getCreatorStoredTier: tierMock }))
vi.mock('@/lib/copilot/queries', () => ({ getRecentMessages: recentMock, countUserMessagesToday: countMock }))
vi.mock('@/lib/copilot/config', () => ({ isCopilotConfigured: configuredMock }))
vi.mock('@/components/kinnso/pages/CreatorCopilotView', () => ({
  CreatorCopilotView: (p: { configured: boolean; remaining: number }) =>
    <div data-testid="view" data-configured={String(p.configured)} data-remaining={p.remaining} />,
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { final: dnaRow } }) }) }) }),
  }),
}))

import StudioCopilotPage from '@/app/[locale]/studio/copilot/page'

beforeEach(() => { creatorPageGateMock.mockResolvedValue({ user: { id: 'creator-1' } }); tierMock.mockResolvedValue('rising'); countMock.mockResolvedValue(0); configuredMock.mockReturnValue(true) })

describe('/[locale]/studio/copilot host', () => {
  it('notFound for non-creator viewers', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(StudioCopilotPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the view for a creator with remaining = limit - used', async () => {
    countMock.mockResolvedValueOnce(5) // rising limit 30 -> remaining 25
    const ui = await StudioCopilotPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    const view = screen.getByTestId('view')
    expect(view.getAttribute('data-configured')).toBe('true')
    expect(view.getAttribute('data-remaining')).toBe('25')
  })

  it('passes configured=false when the gateway is unconfigured', async () => {
    configuredMock.mockReturnValueOnce(false)
    const ui = await StudioCopilotPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('view').getAttribute('data-configured')).toBe('false')
  })
})
