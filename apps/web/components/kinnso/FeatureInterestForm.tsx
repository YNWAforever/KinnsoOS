'use client'

import { useId, useState, useTransition, type FormEvent } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import {
  joinFeatureInterestAction,
  type FeatureInterest,
} from '@/lib/feature-interest/actions'
import { trackTravellerEvent } from '@/lib/analytics/client'

export function FeatureInterestForm({ feature, locale, t, analyticsEntityType, analyticsEntityId }: {
  feature: FeatureInterest
  locale: Locale
  t: Messages['featureInterest']
  analyticsEntityType?: 'experience'
  analyticsEntityId?: string
}) {
  const emailId = useId()
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return

    const form = event.currentTarget
    const data = new FormData(form)
    setMessage(null)

    if (feature === 'booking' && analyticsEntityType && analyticsEntityId) {
      trackTravellerEvent('booking_cta_clicked', {
        locale,
        routeKey: 'experience_detail',
        entityType: analyticsEntityType,
        entityId: analyticsEntityId,
        bookingState: 'off',
      })
    }

    startTransition(async () => {
      const result = await joinFeatureInterestAction({
        feature,
        locale,
        email: String(data.get('email') ?? ''),
        company: String(data.get('company') ?? ''),
      })

      if (result.ok && feature === 'booking' && analyticsEntityType && analyticsEntityId) {
        trackTravellerEvent('waitlist_submitted', {
          locale,
          routeKey: 'experience_detail',
          entityType: analyticsEntityType,
          entityId: analyticsEntityId,
          bookingState: 'off',
          outcome: 'submitted',
        })
      } else if (!result.ok && feature === 'booking' && analyticsEntityType && analyticsEntityId) {
        trackTravellerEvent('waitlist_submitted', {
          locale,
          routeKey: 'experience_detail',
          entityType: analyticsEntityType,
          entityId: analyticsEntityId,
          bookingState: 'off',
          outcome: 'error',
          errorCategory: result.code === 'invalid-email' ? 'invalid' : 'unavailable',
        })
      }

      setMessage(result.ok ? t.success : result.code === 'invalid-email' ? t.invalidEmail : t.retry)
    })
  }

  const submitLabel = feature === 'booking' ? t.submitBooking : t.submitAgent

  return (
    <form aria-label={submitLabel} onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold text-kinnso-ink" htmlFor={emailId}>
        {t.emailLabel}
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t.emailPlaceholder}
          className="min-w-0 flex-1 rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm text-kinnso-ink outline-none focus-visible:ring-2 focus-visible:ring-kinnso-orangeDark focus-visible:ring-offset-2"
        />
        <input
          aria-hidden="true"
          autoComplete="off"
          className="absolute h-px w-px overflow-hidden opacity-0"
          name="company"
          tabIndex={-1}
          type="text"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-kinnso-ink focus-visible:ring-2 focus-visible:ring-kinnso-orangeDark focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t.pending : submitLabel}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-kinnso-muted" role="status">
        {message}
      </p>
    </form>
  )
}

export default FeatureInterestForm
