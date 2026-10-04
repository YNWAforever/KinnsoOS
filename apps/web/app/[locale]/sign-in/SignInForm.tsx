'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { AuthForm, type AuthFormLabels } from '@/components/auth/AuthForm'
import type { Locale } from '@/lib/i18n/config'

interface SignInFormProps {
  locale: Locale
  labels: AuthFormLabels
  errorInvalidCredentials: string
  errorGeneric: string
  serverError?: string
  /** Validated in-app destination from `?next=`, or undefined for the default hub. */
  nextPath?: string
}

export function SignInForm({
  locale,
  labels,
  errorInvalidCredentials,
  errorGeneric,
  serverError,
  nextPath,
}: SignInFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | undefined>(serverError)
  const [pending, setPending] = useState(false)

  async function handleSubmit({ email, password }: { email: string; password: string }) {
    setError(undefined)
    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        // Supabase returns "Invalid login credentials" for wrong email/password.
        setError(errorInvalidCredentials)
        return
      }
      // On success, honour a validated `?next=` (the ops invite deep-link
      // depends on it) and otherwise navigate through the role-aware hub
      // (/studio routes merchant/ops/creator to the right place). refresh()
      // forces the server to pick up the new auth cookie.
      router.push(nextPath ?? `/${locale}/studio`)
      router.refresh()
    } catch {
      setError(errorGeneric)
    } finally {
      setPending(false)
    }
  }

  return <AuthForm mode="sign-in" labels={labels} onSubmit={handleSubmit} errorMessage={error} pending={pending} />
}
