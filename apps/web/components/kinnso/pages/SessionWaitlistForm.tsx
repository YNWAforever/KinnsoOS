'use client'

import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { Locale } from '@/lib/i18n/config'
import { joinSessionWaitlistAction } from '@/lib/sessions/waitlist-actions'

export type SessionWaitlistFormStrings = {
  formLabel: string
  emailLabel: string
  submit: string
  pending: string
  success: string
  invalid: string
  rateLimited: string
  retry: string
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'invalid' | 'rate_limited' | 'failed'

export function SessionWaitlistForm({
  locale,
  strings,
}: {
  locale: Locale
  strings: SessionWaitlistFormStrings
}) {
  const emailId = useId()
  const feedbackId = useId()
  const [email, setEmail] = useState('')
  const [hp, setHp] = useState('')
  const [status, setStatus] = useState<FormStatus>('idle')
  const isSubmitting = status === 'submitting'
  const errorMessage = status === 'invalid'
    ? strings.invalid
    : status === 'rate_limited'
      ? strings.rateLimited
      : status === 'failed'
        ? strings.retry
        : null

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    setStatus('submitting')
    try {
      const result = await joinSessionWaitlistAction(locale, email, hp)
      if (result.ok) {
        setEmail('')
        setHp('')
        setStatus('success')
        return
      }
      setStatus(result.error)
    } catch {
      setStatus('failed')
    }
  }

  return (
    <form
      noValidate
      aria-label={strings.formLabel}
      aria-busy={isSubmitting}
      className="mt-7 grid max-w-md gap-3"
      onSubmit={onSubmit}
    >
      <label htmlFor={emailId} className="text-sm font-semibold text-kinnso-ink">
        {strings.emailLabel}
      </label>
      <input
        id={emailId}
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={status === 'invalid' ? true : undefined}
        aria-describedby={errorMessage ? feedbackId : undefined}
        className="k2-input w-full"
      />

      <div aria-hidden="true" className="absolute -left-[9999px]" tabIndex={-1}>
        <label>
          Leave this field empty
          <input
            type="text"
            name="website"
            value={hp}
            onChange={(event) => setHp(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <button type="submit" disabled={isSubmitting} className="k2-btn-primary justify-self-start">
        {isSubmitting ? strings.pending : strings.submit}
      </button>

      {status === 'success' ? (
        <p id={feedbackId} role="status" aria-live="polite" className="text-sm font-semibold text-kinnso-ink">
          {strings.success}
        </p>
      ) : null}
      {errorMessage ? (
        <p id={feedbackId} role="alert" className="text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </form>
  )
}
