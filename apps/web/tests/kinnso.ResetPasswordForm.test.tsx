// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ResetPasswordForm } from '@/app/[locale]/auth/reset-password/ResetPasswordForm'

const { setSessionMock, updateUserMock, pushMock, refreshMock } = vi.hoisted(() => ({
  setSessionMock: vi.fn(),
  updateUserMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { setSession: setSessionMock, updateUser: updateUserMock },
  }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

const labels = { newPassword: 'New password', confirmPassword: 'Confirm password', submit: 'Reset password' }
const commonProps = {
  locale: 'en' as const,
  labels,
  errorGeneric: 'Something went wrong.',
  errorPasswordMismatch: "Passwords don't match.",
  errorPasswordTooShort: 'Password must be at least 8 characters.',
  linkInvalidTitle: 'This link is invalid or has expired',
  linkInvalidDesc: 'Request a new password reset link.',
  forgotPasswordHref: '/en/forgot-password',
  forgotPasswordLinkLabel: 'Forgot password?',
}

function setHash(hash: string) {
  window.history.pushState(null, '', `/en/auth/reset-password${hash}`)
}

beforeEach(() => {
  cleanup()
  setSessionMock.mockReset()
  updateUserMock.mockReset()
  pushMock.mockReset()
  refreshMock.mockReset()
  window.history.pushState(null, '', '/en/auth/reset-password')
})

describe('ResetPasswordForm', () => {
  it('shows the invalid-link state when the hash has no recovery tokens', async () => {
    render(<ResetPasswordForm {...commonProps} />)
    await waitFor(() => expect(screen.getByText('This link is invalid or has expired')).toBeInTheDocument())
    expect(setSessionMock).not.toHaveBeenCalled()
  })

  it('shows the invalid-link state when Supabase reports an error in the hash (expired/used link)', async () => {
    setHash('#error=access_denied&error_code=otp_expired')
    render(<ResetPasswordForm {...commonProps} />)
    await waitFor(() => expect(screen.getByText('This link is invalid or has expired')).toBeInTheDocument())
  })

  it('establishes the session from valid recovery tokens and shows the new-password form', async () => {
    setHash('#access_token=tok123&refresh_token=refresh123&type=recovery')
    setSessionMock.mockResolvedValue({ error: null })
    render(<ResetPasswordForm {...commonProps} />)

    await waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith({ access_token: 'tok123', refresh_token: 'refresh123' }),
    )
    await waitFor(() => expect(screen.getByLabelText('New password')).toBeInTheDocument())
  })

  it('rejects a too-short password before calling updateUser', async () => {
    setHash('#access_token=tok123&refresh_token=refresh123&type=recovery')
    setSessionMock.mockResolvedValue({ error: null })
    render(<ResetPasswordForm {...commonProps} />)
    await waitFor(() => expect(screen.getByLabelText('New password')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByText('Reset password'))

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords before calling updateUser', async () => {
    setHash('#access_token=tok123&refresh_token=refresh123&type=recovery')
    setSessionMock.mockResolvedValue({ error: null })
    render(<ResetPasswordForm {...commonProps} />)
    await waitFor(() => expect(screen.getByLabelText('New password')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough2' } })
    fireEvent.click(screen.getByText('Reset password'))

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('updates the password and redirects to /studio on success', async () => {
    setHash('#access_token=tok123&refresh_token=refresh123&type=recovery')
    setSessionMock.mockResolvedValue({ error: null })
    updateUserMock.mockResolvedValue({ error: null })
    render(<ResetPasswordForm {...commonProps} />)
    await waitFor(() => expect(screen.getByLabelText('New password')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByText('Reset password'))

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: 'longenough1' }))
    expect(pushMock).toHaveBeenCalledWith('/en/studio')
    expect(refreshMock).toHaveBeenCalled()
  })
})
