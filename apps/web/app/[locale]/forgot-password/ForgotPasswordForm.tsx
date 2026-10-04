'use client'

import { useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n/config'

interface ForgotPasswordFormProps {
  locale: Locale
  labels: {
    email: string
    submit: string
  }
  errorGeneric: string
  emailSentDesc: string
}

export function ForgotPasswordForm({ locale, labels, errorGeneric, emailSentDesc }: ForgotPasswordFormProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = emailRef.current?.value.trim() ?? ''
    if (!email) return

    setError(undefined)
    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${locale}/auth/reset-password`,
      })
      // Supabase never reports whether the email has an account (avoids leaking that to a
      // caller) — a real error here means something else went wrong (rate limit, malformed
      // input the client didn't catch, network failure), not "no such account".
      if (resetError) {
        setError(errorGeneric)
        return
      }
      setSent(true)
    } catch {
      setError(errorGeneric)
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <p className="text-sm text-kinnso-ink" role="status">
        {emailSentDesc}
      </p>
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
        <label htmlFor="forgot-password-email" className="text-sm font-medium text-kinnso-ink">
          {labels.email}
        </label>
        <input
          ref={emailRef}
          id="forgot-password-email"
          type="email"
          autoComplete="email"
          required
          className="border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kinnso-ink/30"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-kinnso-ink text-kinnso-cream rounded px-4 py-2 text-sm font-medium hover:bg-kinnso-ink/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {labels.submit}
      </button>
    </form>
  )
}
