// apps/web/tests/sessions.waitlist-form.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { joinSessionWaitlistActionMock } = vi.hoisted(() => ({
  joinSessionWaitlistActionMock: vi.fn(),
}))

vi.mock('@/lib/sessions/waitlist-actions', () => ({
  joinSessionWaitlistAction: joinSessionWaitlistActionMock,
}))

import { SessionWaitlistForm } from '@/components/kinnso/pages/SessionWaitlistForm'

const strings = {
  formLabel: 'Session updates',
  emailLabel: 'Email address',
  submit: 'Join the waitlist',
  pending: 'Joining…',
  success: 'You are on the list.',
  invalid: 'Enter a valid email address.',
  rateLimited: 'Too many attempts. Please try again later.',
  retry: 'Something went wrong. Please try again.',
}

afterEach(cleanup)
beforeEach(() => {
  joinSessionWaitlistActionMock.mockReset()
})

function renderForm() {
  render(<SessionWaitlistForm locale="en" strings={strings} />)
  return {
    email: screen.getByRole('textbox', { name: strings.emailLabel }),
    submit: screen.getByRole('button', { name: strings.submit }),
    form: screen.getByRole('form', { name: strings.formLabel }),
  }
}

describe('SessionWaitlistForm', () => {
  it('starts idle with a labeled email field and enabled submit button', () => {
    const { email, submit } = renderForm()

    expect(email.getAttribute('type')).toBe('email')
    expect(email.hasAttribute('required')).toBe(true)
    expect((submit as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows and disables the pending submit state', async () => {
    let resolveAction: ((value: { ok: true }) => void) | undefined
    joinSessionWaitlistActionMock.mockImplementationOnce(
      () => new Promise<{ ok: true }>((resolve) => { resolveAction = resolve }),
    )
    const { email, form } = renderForm()
    fireEvent.change(email, { target: { value: 'traveller@example.com' } })

    fireEvent.submit(form)

    const pending = screen.getByRole('button', { name: strings.pending }) as HTMLButtonElement
    expect(pending.disabled).toBe(true)

    await act(async () => { resolveAction?.({ ok: true }) })
  })

  it('submits the locale and email, clears the email on success, and announces politely', async () => {
    joinSessionWaitlistActionMock.mockResolvedValueOnce({ ok: true })
    const { email, form } = renderForm()
    fireEvent.change(email, { target: { value: 'Traveller@example.com' } })

    fireEvent.submit(form)

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(strings.success))
    expect(joinSessionWaitlistActionMock).toHaveBeenCalledWith('en', 'Traveller@example.com', '')
    expect((email as HTMLInputElement).value).toBe('')
  })

  it('disables native validation and announces the localized invalid action result', async () => {
    joinSessionWaitlistActionMock.mockResolvedValueOnce({ ok: false, error: 'invalid' })
    const { email, form } = renderForm()
    fireEvent.change(email, { target: { value: 'bad' } })

    expect((form as HTMLFormElement).noValidate).toBe(true)
    fireEvent.submit(form)

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toBe(strings.invalid)
    expect((email as HTMLInputElement).value).toBe('bad')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe(alert.id)
  })

  it.each([
    ['rate_limited', strings.rateLimited],
    ['failed', strings.retry],
  ] as const)('describes %s without marking the email invalid', async (error, message) => {
    joinSessionWaitlistActionMock.mockResolvedValueOnce({ ok: false, error })
    const { email, form } = renderForm()
    fireEvent.change(email, { target: { value: 'traveller@example.com' } })

    fireEvent.submit(form)

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toBe(message)
    expect((email as HTMLInputElement).value).toBe('traveller@example.com')
    expect(email.getAttribute('aria-invalid')).toBeNull()
    expect(email.getAttribute('aria-describedby')).toBe(alert.id)
  })
})
