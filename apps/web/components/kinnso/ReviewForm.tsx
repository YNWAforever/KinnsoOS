'use client'

import { useState, type FormEvent } from 'react'
import { submitReviewAction } from '@/lib/reviews/actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ReviewForm({ locale, bookingId, experienceId, guideId, t, onSubmitted }: {
  locale: Locale
  bookingId: string
  experienceId: string
  guideId: string | null
  t: Messages['reviews']
  onSubmitted?: () => void
}) {
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const result = await submitReviewAction(locale, bookingId, experienceId, guideId, { rating, body })
    setPending(false)
    if (result.ok) {
      setSubmitted(true)
      onSubmitted?.()
    } else {
      // submitReviewAction returns ALREADY_REVIEWED/NOT_ELIGIBLE as translation
      // keys (never literal text) so this stays in the caller's own locale --
      // any other `errors.form` value (e.g. the shared "Sign in is required"
      // guard message) passes through as-is, matching every other form here.
      const formCode = result.errors.form?.[0]
      const message =
        formCode === 'ALREADY_REVIEWED'
          ? t.alreadyReviewed
          : formCode === 'NOT_ELIGIBLE'
            ? t.genericError
            : (formCode ?? result.errors.rating?.[0] ?? t.genericError)
      setError(message)
    }
  }

  if (submitted) {
    return <p className="text-sm font-semibold text-kinnso-ink">{t.submitted}</p>
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-kinnso-cream2 bg-white p-4 text-left">
      <h3 className="text-sm font-bold text-kinnso-ink">{t.formHeading}</h3>
      <div role="radiogroup" aria-label={t.ratingLabel} className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}`}
            onClick={() => setRating(n)}
            className={rating >= n ? 'text-kinnso-orangeDark' : 'text-kinnso-cream2'}
          >
            ★
          </button>
        ))}
      </div>
      <label className="mt-3 block text-xs font-semibold text-kinnso-muted" htmlFor="review-body">
        {t.bodyLabel}
      </label>
      <textarea
        id="review-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t.bodyPlaceholder}
        className="mt-1 w-full rounded-[3px] border border-kinnso-cream2 p-2 text-sm"
        rows={3}
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || rating === 0}
        className="mt-3 rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? t.submittingCta : t.submitCta}
      </button>
    </form>
  )
}

export default ReviewForm
