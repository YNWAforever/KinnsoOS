// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const useChatMock = vi.hoisted(() => vi.fn())
vi.mock('@ai-sdk/react', () => ({ useChat: useChatMock }))
vi.mock('ai', () => ({ DefaultChatTransport: class {} }))

import { CreatorCopilotView } from '@/components/kinnso/pages/CreatorCopilotView'

const base = { locale: 'en' as const, t: en.copilot, configured: true, remaining: 5, initialMessages: [] }

describe('CreatorCopilotView', () => {
  it('renders the unconfigured card when not configured', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready' })
    render(<CreatorCopilotView {...base} configured={false} />)
    expect(screen.getByText(en.copilot.unconfiguredTitle)).toBeTruthy()
  })

  it('renders the empty state with the input enabled when configured and under limit', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready' })
    render(<CreatorCopilotView {...base} />)
    expect(screen.getByText(en.copilot.emptyTitle)).toBeTruthy()
    expect((screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('shows the limit card and disables input when no messages remain', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready' })
    render(<CreatorCopilotView {...base} remaining={0} />)
    expect(screen.getByText(en.copilot.limitTitle)).toBeTruthy()
    expect((screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('renders an existing assistant message', () => {
    useChatMock.mockReturnValue({
      messages: [{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Here are 5 ideas' }] }],
      sendMessage: vi.fn(), status: 'ready',
    })
    render(<CreatorCopilotView {...base} />)
    expect(screen.getByText('Here are 5 ideas')).toBeTruthy()
  })

  it('shows the generic error message and keeps the input usable when status is error', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'error', clearError: vi.fn() })
    render(<CreatorCopilotView {...base} />)
    expect(screen.getByText(en.copilot.errorGeneric)).toBeTruthy()
    // The send button must NOT be permanently disabled in the error state — the user can retry.
    expect((screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('sends the typed text with the locale body and clears the input on click', () => {
    const sendMessage = vi.fn()
    useChatMock.mockReturnValue({ messages: [], sendMessage, status: 'ready', clearError: vi.fn() })
    render(<CreatorCopilotView {...base} />)
    const input = screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'give me 5 ideas' } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.copilot.send) }))
    expect(sendMessage).toHaveBeenCalledWith({ text: 'give me 5 ideas' }, { body: { locale: 'en' } })
    expect(input.value).toBe('')
  })

  it('sends on Enter (without shift) and clears the input', () => {
    const sendMessage = vi.fn()
    useChatMock.mockReturnValue({ messages: [], sendMessage, status: 'ready', clearError: vi.fn() })
    render(<CreatorCopilotView {...base} />)
    const input = screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'draft a caption' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    expect(sendMessage).toHaveBeenCalledWith({ text: 'draft a caption' }, { body: { locale: 'en' } })
    expect(input.value).toBe('')
  })

  it('clears the prior error before re-sending so a retry is not blocked', () => {
    const sendMessage = vi.fn()
    const clearError = vi.fn()
    useChatMock.mockReturnValue({ messages: [], sendMessage, status: 'error', clearError })
    render(<CreatorCopilotView {...base} />)
    const input = screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'retry this' } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.copilot.send) }))
    expect(clearError).toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith({ text: 'retry this' }, { body: { locale: 'en' } })
  })
})
