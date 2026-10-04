// apps/web/tests/kinnso.agent-chat-view.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { sendMessageMock, rateActionMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  rateActionMock: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Plan a Tokyo trip' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Here is a guide...' }] },
    ],
    sendMessage: sendMessageMock,
    status: 'ready',
    clearError: vi.fn(),
  }),
}))
vi.mock('ai', () => ({ DefaultChatTransport: vi.fn() }))
vi.mock('@/lib/agent/actions', () => ({ rateAgentMessageAction: rateActionMock }))

import en from '@/lib/i18n/messages/en'
import { AgentChatView } from '@/components/kinnso/pages/AgentChatView'

describe('AgentChatView', () => {
  it('renders the value-prop cards as an empty state when there are no messages', async () => {
    vi.resetModules()
    vi.doMock('@ai-sdk/react', () => ({ useChat: () => ({ messages: [], sendMessage: sendMessageMock, status: 'ready', clearError: vi.fn() }) }))
    const { AgentChatView: AgentChatViewWithEmptyMessages } = await import('@/components/kinnso/pages/AgentChatView')
    render(<AgentChatViewWithEmptyMessages locale="en" t={en.agent} configured={true} bookingLive={false} anonSessionId="sess-1" viewerSignedIn={false} />)
    expect(screen.getByText(en.agent.point1Title)).toBeTruthy()
    expect(screen.getByText(en.agent.point1Body)).toBeTruthy()
    expect(screen.queryByText(/bookable experience/i)).toBeNull()
    expect(screen.getByText(en.agent.bodyBookingWaitlist)).toBeTruthy()
    expect(screen.getByText(en.agent.point3TitleBookingWaitlist)).toBeTruthy()
    expect(screen.getByText(en.agent.point3BodyBookingWaitlist)).toBeTruthy()
  })

  it('renders booking-aware body and third value prop when Booking is ON', async () => {
    vi.resetModules()
    vi.doMock('@ai-sdk/react', () => ({ useChat: () => ({ messages: [], sendMessage: sendMessageMock, status: 'ready', clearError: vi.fn() }) }))
    const { AgentChatView: AgentChatViewWithEmptyMessages } = await import('@/components/kinnso/pages/AgentChatView')
    render(<AgentChatViewWithEmptyMessages locale="en" t={en.agent} configured={true} bookingLive anonSessionId="sess-1" viewerSignedIn={false} />)
    expect(screen.getByText(en.agent.bodyBookingLive)).toBeTruthy()
    expect(screen.getByText(en.agent.point3TitleBookingLive)).toBeTruthy()
    expect(screen.getByText(en.agent.point3BodyBookingLive)).toBeTruthy()
  })
  it('renders messages and a thumbs up/down control under each assistant message', () => {
    render(<AgentChatView locale="en" t={en.agent} configured={true} bookingLive={false} anonSessionId="sess-1" viewerSignedIn={false} />)
    expect(screen.getByText('Here is a guide...')).toBeTruthy()
    expect(screen.getByLabelText(en.agent.ratingUpLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.agent.ratingDownLabel)).toBeTruthy()
  })

  it('clicking thumbs-up calls rateAgentMessageAction with the message id and anonSessionId', async () => {
    render(<AgentChatView locale="en" t={en.agent} configured={true} bookingLive={false} anonSessionId="sess-1" viewerSignedIn={false} />)
    fireEvent.click(screen.getByLabelText(en.agent.ratingUpLabel))
    expect(rateActionMock).toHaveBeenCalledWith('m2', 'up', 'sess-1')
  })

  it('sends the anonSessionId in the request body when not signed in', () => {
    render(<AgentChatView locale="en" t={en.agent} configured={true} bookingLive={false} anonSessionId="sess-1" viewerSignedIn={false} />)
    fireEvent.change(screen.getByPlaceholderText(en.agent.inputPlaceholder), { target: { value: 'hello' } })
    fireEvent.click(screen.getByText(en.agent.send))
    expect(sendMessageMock).toHaveBeenCalledWith({ text: 'hello' }, { body: { locale: 'en', anonSessionId: 'sess-1' } })
  })

  it('renders an unconfigured state when configured=false', () => {
    render(<AgentChatView locale="en" t={en.agent} configured={false} bookingLive={false} anonSessionId="sess-1" viewerSignedIn={false} />)
    expect(screen.getByText(en.agent.unconfiguredTitle)).toBeTruthy()
  })
})
