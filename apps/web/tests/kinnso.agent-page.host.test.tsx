// apps/web/tests/kinnso.agent-page.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { createSupabaseServerClientMock, getUserMock, getAgentMessagesMock, configuredStateMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  getUserMock: vi.fn(async () => ({ data: { user: null as { id: string } | null } })),
  getAgentMessagesMock: vi.fn(async () => [] as Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>),
  configuredStateMock: vi.fn(() => ({ agentLive: true, bookingLive: false })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))
vi.mock('@/lib/product-state', () => ({ resolveConfiguredProductState: configuredStateMock }))
vi.mock('@/lib/agent/config', () => ({ isAgentConfigured: () => true }))
vi.mock('@/lib/agent/queries', () => ({ getAgentMessages: getAgentMessagesMock }))
vi.mock('@/components/kinnso/pages/AgentChatView', () => ({
  AgentChatView: (p: { configured: boolean; bookingLive: boolean; viewerSignedIn: boolean; anonSessionId: string; initialMessages: Array<{ id: string }> }) => (
    <div
      data-testid="chat-view"
      data-configured={String(p.configured)}
      data-booking-live={String(p.bookingLive)}
      data-signed-in={String(p.viewerSignedIn)}
      data-anon-session={p.anonSessionId}
      data-initial-count={p.initialMessages.length}
    />
  ),
}))

import AgentPage from '@/app/[locale]/agent/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  configuredStateMock.mockReturnValue({ agentLive: true, bookingLive: false })
  getUserMock.mockResolvedValue({ data: { user: null } })
  createSupabaseServerClientMock.mockClear()
  createSupabaseServerClientMock.mockResolvedValue({ auth: { getUser: getUserMock } })
  getAgentMessagesMock.mockClear()
  getAgentMessagesMock.mockResolvedValue([])
})

describe('/[locale]/agent host', () => {
  it('renders the waitlist before auth, history, or chat when Agent is OFF', async () => {
    configuredStateMock.mockReturnValueOnce({ agentLive: false, bookingLive: false })
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { name: en.agent.waitlistTitle })).toBeTruthy()
    expect(screen.getByRole('form', { name: en.featureInterest.submitAgent })).toBeTruthy()
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
    expect(getUserMock).not.toHaveBeenCalled()
    expect(getAgentMessagesMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('chat-view')).toBeNull()
  })
  it('renders AgentChatView with viewerSignedIn=false and a generated anonSessionId for an anon visitor', async () => {
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    const view = screen.getByTestId('chat-view')
    expect(view.getAttribute('data-signed-in')).toBe('false')
    expect(view.getAttribute('data-anon-session')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('passes Booking OFF through to the live Agent chat', async () => {
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('chat-view').getAttribute('data-booking-live')).toBe('false')
  })

  it('passes Booking ON through to the live Agent chat', async () => {
    configuredStateMock.mockReturnValueOnce({ agentLive: true, bookingLive: true })
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('chat-view').getAttribute('data-booking-live')).toBe('true')
  })
  it('renders AgentChatView with viewerSignedIn=true for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('chat-view').getAttribute('data-signed-in')).toBe('true')
  })

  it('does not fetch agent message history for an anon visitor', async () => {
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(getAgentMessagesMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('chat-view').getAttribute('data-initial-count')).toBe('0')
  })

  it('fetches and passes through a signed-in traveller saved conversation as initialMessages', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })
    getAgentMessagesMock.mockResolvedValueOnce([
      { id: 'm1', role: 'user', content: 'Plan a Tokyo trip', created_at: '2026-01-01T00:00:00Z' },
      { id: 'm2', role: 'assistant', content: 'Here is a guide...', created_at: '2026-01-01T00:00:01Z' },
    ])
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(getAgentMessagesMock).toHaveBeenCalledWith(expect.anything(), 'traveler-1')
    expect(screen.getByTestId('chat-view').getAttribute('data-initial-count')).toBe('2')
  })
})
