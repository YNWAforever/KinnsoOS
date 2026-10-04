// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { joinFeatureInterestActionMock } = vi.hoisted(() => ({
  joinFeatureInterestActionMock: vi.fn(),
}))

vi.mock('@/lib/feature-interest/actions', () => ({
  joinFeatureInterestAction: joinFeatureInterestActionMock,
}))

import { FeatureInterestForm } from '@/components/kinnso/FeatureInterestForm'

const t = {
  emailLabel: 'Email address',
  emailPlaceholder: 'you@example.com',
  submitAgent: 'Join the Agent waitlist',
  submitBooking: 'Get notified when booking opens',
  pending: 'Joining…',
  success: "You're on the list.",
  invalidEmail: 'Enter a valid email address.',
  retry: 'Could not save your interest. Please try again.',
}

afterEach(cleanup)
beforeEach(() => {
  joinFeatureInterestActionMock.mockReset()
  joinFeatureInterestActionMock.mockResolvedValue({ ok: true })
})

function renderForm(feature: 'agent' | 'booking' | 'sessions' = 'agent') {
  return render(<FeatureInterestForm feature={feature} locale="en" t={t} />)
}

function submit(email = 'traveller@example.com') {
  fireEvent.change(screen.getByLabelText(t.emailLabel), { target: { value: email } })
  fireEvent.submit(screen.getByRole('form'))
}

describe('FeatureInterestForm', () => {
  it('renders an explicitly labelled email field and an inaccessible honeypot', () => {
    const { container } = renderForm()

    expect(screen.getByLabelText(t.emailLabel)).toHaveAttribute('type', 'email')
    expect(screen.getByPlaceholderText(t.emailPlaceholder)).toBeInTheDocument()
    const honeypot = container.querySelector('input[name="company"]')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
    expect(honeypot).toHaveAttribute('aria-hidden', 'true')
  })

  it.each([
    ['agent', t.submitAgent],
    ['booking', t.submitBooking],
  ] as const)('uses the feature-specific submit label for %s', (feature, label) => {
    renderForm(feature)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  it('disables duplicate submission and shows pending copy while the action is running', async () => {
    let resolveAction!: (value: { ok: true }) => void
    joinFeatureInterestActionMock.mockReturnValueOnce(new Promise((resolve) => { resolveAction = resolve }))
    renderForm('booking')

    submit()

    await waitFor(() => expect(screen.getByRole('button', { name: t.pending })).toBeDisabled())
    fireEvent.submit(screen.getByRole('form'))
    expect(joinFeatureInterestActionMock).toHaveBeenCalledTimes(1)
    resolveAction({ ok: true })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t.success))
  })

  it('announces success through a status region', async () => {
    renderForm()
    submit()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t.success))
    expect(joinFeatureInterestActionMock).toHaveBeenCalledWith({
      feature: 'agent',
      email: 'traveller@example.com',
      locale: 'en',
      company: '',
    })
  })

  it('shows localized invalid-email feedback', async () => {
    joinFeatureInterestActionMock.mockResolvedValueOnce({ ok: false, code: 'invalid-email' })
    renderForm()
    submit('invalid')

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t.invalidEmail))
  })

  it('shows localized retry feedback and clears a stale message on resubmit', async () => {
    joinFeatureInterestActionMock
      .mockResolvedValueOnce({ ok: false, code: 'retry' })
      .mockResolvedValueOnce({ ok: true })
    renderForm()
    submit()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t.retry))

    await waitFor(() => expect(screen.getByRole('button', { name: t.submitAgent })).not.toBeDisabled())
    submit()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t.success))
    expect(screen.queryByText(t.retry)).not.toBeInTheDocument()
  })
})
