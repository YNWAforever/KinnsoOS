'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n/config'

interface ResetPasswordFormProps {
  locale: Locale
  labels: {
    newPassword: string
    confirmPassword: string
    submit: string
  }
  errorGeneric: string
  errorPasswordMismatch: string
  errorPasswordTooShort: string
  linkInvalidTitle: string
  linkInvalidDesc: string
  forgotPasswordHref: string
  forgotPasswordLinkLabel: string
}

type Status = 'checking' | 'ready' | 'invalid' | 'submitting' | 'done'

const MIN_PASSWORD_LENGTH = 8

/**
 * Supabase's password-recovery email links use the implicit flow: the tokens arrive as a URL
 * fragment (#access_token=...&refresh_token=...&type=recovery), never sent to the server, so
 * this has to run entirely client-side. A failed/expired link instead carries
 * #error=...&error_code=....
 */
export function ResetPasswordForm({
  locale,
  labels,
  errorGeneric,
  errorPasswordMismatch,
  errorPasswordTooShort,
  linkInvalidTitle,
  linkInvalidDesc,
  forgotPasswordHref,
  forgotPasswordLinkLabel,
}: ResetPasswordFormProps) {
  const router = useRouter()
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false

    async function consumeRecoveryLink() {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')
      const linkError = params.get('error')

      if (linkError || type !== 'recovery' || !accessToken || !refreshToken) {
        if (!cancelled) setStatus('invalid')
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (cancelled) return
      if (sessionError) {
        setStatus('invalid')
        return
      }

      // Drop the tokens from the URL/history now that the session is established.
      window.history.replaceState(null, '', window.location.pathname)
      setStatus('ready')
    }

    void consumeRecoveryLink()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = passwordRef.current?.value ?? ''
    const confirm = confirmRef.current?.value ?? ''

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(errorPasswordTooShort)
      return
    }
    if (password !== confirm) {
      setError(errorPasswordMismatch)
      return
    }

    setError(undefined)
    setStatus('submitting')
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(errorGeneric)
        setStatus('ready')
        return
      }
      router.push(`/${locale}/studio`)
      router.refresh()
    } catch {
      setError(errorGeneric)
      setStatus('ready')
    }
  }

  if (status === 'checking') return null

  if (status === 'invalid') {
    return (
      <div>
        <p className="text-sm text-kinnso-ink">{linkInvalidTitle}</p>
        <p className="mt-2 text-sm text-kinnso-muted">
          {linkInvalidDesc}{' '}
          <Link href={forgotPasswordHref} className="underline text-kinnso-ink">
            {forgotPasswordLinkLabel}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 w-full max-w-sm">
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className="text-sm font-medium text-kinnso-ink">
          {labels.newPassword}
        </label>
        <input
          ref={passwordRef}
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kinnso-ink/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirm-password" className="text-sm font-medium text-kinnso-ink">
          {labels.confirmPassword}
        </label>
        <input
          ref={confirmRef}
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kinnso-ink/30"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="bg-kinnso-ink text-kinnso-cream rounded px-4 py-2 text-sm font-medium hover:bg-kinnso-ink/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {labels.submit}
      </button>
    </form>
  )
}
