// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ForgotPasswordForm } from '@/app/[locale]/forgot-password/ForgotPasswordForm'

const { resetPasswordForEmailMock } = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { resetPasswordForEmail: resetPasswordForEmailMock },
  }),
}))

const labels = { email: 'Email address', submit: 'Send reset link' }

beforeEach(() => {
  cleanup()
  resetPasswordForEmailMock.mockReset()
})

describe('ForgotPasswordForm', () => {
  it('calls resetPasswordForEmail with a redirectTo pointing at the locale-scoped reset-password page', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ error: null })
    render(
      <ForgotPasswordForm
        locale="en"
        labels={labels}
        errorGeneric="Something went wrong."
        emailSentDesc="Check your email."
      />,
    )

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'creator@example.com' } })
    fireEvent.click(screen.getByText('Send reset link'))

    await waitFor(() =>
      expect(resetPasswordForEmailMock).toHaveBeenCalledWith('creator@example.com', {
        redirectTo: expect.stringContaining('/en/auth/reset-password'),
      }),
    )
  })

  it('shows the confirmation message after a successful request, not the raw error', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ error: null })
    render(
      <ForgotPasswordForm
        locale="en"
        labels={labels}
        errorGeneric="Something went wrong."
        emailSentDesc="Check your email."
      />,
    )

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'creator@example.com' } })
    fireEvent.click(screen.getByText('Send reset link'))

    await waitFor(() => expect(screen.getByText('Check your email.')).toBeInTheDocument())
  })

  it('shows a generic error on a real failure (rate limit, network) without leaking account existence', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ error: { message: 'rate limit exceeded' } })
    render(
      <ForgotPasswordForm
        locale="en"
        labels={labels}
        errorGeneric="Something went wrong."
        emailSentDesc="Check your email."
      />,
    )

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'creator@example.com' } })
    fireEvent.click(screen.getByText('Send reset link'))

    await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeInTheDocument())
  })
})
