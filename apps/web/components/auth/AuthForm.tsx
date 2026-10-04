'use client'

import { useRef } from 'react'

export interface AuthFormLabels {
  email: string
  password: string
  submit: string
}

export interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
  labels: AuthFormLabels
  onSubmit: (values: { email: string; password: string }) => void
  errorMessage?: string
  pending?: boolean
}

/**
 * Reusable email/password form for sign-in and sign-up pages.
 * - Client component (uses refs for controlled reads on submit).
 * - Validates non-empty fields before calling onSubmit.
 * - Displays server-side errorMessage (from the page action) via role="alert".
 * - Styling: minimal Tailwind; no external UI library dependency.
 */
export function AuthForm({ mode, labels, onSubmit, errorMessage, pending = false }: AuthFormProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = emailRef.current?.value.trim() ?? ''
    const password = passwordRef.current?.value ?? ''
    if (!email || !password) return
    onSubmit({ email, password })
  }

  const emailId = `${mode}-email`
  const passwordId = `${mode}-password`

  return (
    <form
      aria-label={labels.submit}
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 w-full max-w-sm"
    >
      {errorMessage && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={emailId} className="text-sm font-medium text-kinnso-ink">
          {labels.email}
        </label>
        <input
          ref={emailRef}
          id={emailId}
          type="email"
          autoComplete={mode === 'sign-in' ? 'email' : 'email'}
          required
          className="border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kinnso-ink/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={passwordId} className="text-sm font-medium text-kinnso-ink">
          {labels.password}
        </label>
        <input
          ref={passwordRef}
          id={passwordId}
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
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
