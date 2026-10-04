// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { pushMock, refreshMock, signUpMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  signUpMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signUp: signUpMock } }),
}))

import { SignUpForm } from '@/app/[locale]/sign-up/SignUpForm'

const labels = { email: 'Email address', password: 'Password', submit: 'Sign up' }

const renderForm = () =>
  render(
    <SignUpForm
      locale="en"
      labels={labels}
      errorEmailTaken="That email is already registered."
      errorInvalidEmail="Enter a valid email address."
      errorRateLimited="Too many sign-up attempts. Please wait a minute and try again."
      errorGeneric="Something went wrong."
    />,
  )

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'someone@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2pass' } })
  fireEvent.submit(screen.getByRole('form'))
}

afterEach(cleanup)
beforeEach(() => {
  pushMock.mockReset()
  refreshMock.mockReset()
  signUpMock.mockReset()
})

describe('SignUpForm', () => {
  it('redirects to the sent state for a genuinely new signup (email confirmation required, no session)', async () => {
    signUpMock.mockResolvedValue({ data: { user: { identities: [{ id: 'i1' }] }, session: null }, error: null })
    renderForm()
    fillAndSubmit()
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/sign-up?sent=1'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends an auto-confirmed signup straight into the creator wizard when a session is returned', async () => {
    // With email confirmation disabled, signUp returns a live session — the user is
    // already signed in, so we must not strand them on the "check your email" screen.
    signUpMock.mockResolvedValue({
      data: { user: { identities: [{ id: 'i1' }] }, session: { access_token: 'tok' } },
      error: null,
    })
    renderForm()
    fillAndSubmit()
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/creator'))
    expect(refreshMock).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the already-registered message (not a false "email sent") when Supabase returns an obfuscated empty-identities user', async () => {
    // Enumeration protection: repeated signup of an existing confirmed email
    // returns a 200 with no error and an obfuscated user whose identities are empty.
    signUpMock.mockResolvedValue({ data: { user: { identities: [] } }, error: null })
    renderForm()
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe('That email is already registered.')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('shows the already-registered message when Supabase returns an explicit error', async () => {
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'User already registered' } })
    renderForm()
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe('That email is already registered.')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('shows the invalid-email message when Supabase rejects the email address', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 400, error_code: 'email_address_invalid', message: 'Email address is invalid' },
    })
    renderForm()
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address.')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('shows the rate-limit message when Supabase throttles signup emails', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
    })
    renderForm()
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many sign-up attempts. Please wait a minute and try again.',
    )
    expect(pushMock).not.toHaveBeenCalled()
  })
})
