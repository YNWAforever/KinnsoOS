// apps/web/components/kinnso/pages/BookingWidget.tsx
'use client'

import { useState, useTransition } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { PublicAvailability } from '@/lib/experiences/public-availability-queries'
import { createCheckoutSessionAction } from '@/lib/experiences/booking-actions'
import { trackTravellerEvent } from '@/lib/analytics/client'

export function BookingWidget({ locale, t, experience, availability, viewerEmail, sourceSurface, guideSlug }: {
  locale: Locale
  t: Messages['booking']
  experience: PublicExperience
  availability: PublicAvailability[]
  viewerEmail: string | null
  sourceSurface?: string
  guideSlug?: string
}) {
  const [selectedId, setSelectedId] = useState(availability.find((a) => a.remaining > 0)?.id ?? '')
  const [qty, setQty] = useState('1')
  const [guestEmail, setGuestEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selected = availability.find((a) => a.id === selectedId)

  function handleSubmit() {
    setError(null)
    trackTravellerEvent('booking_cta_clicked', {
      locale,
      routeKey: 'experience_detail',
      entityType: 'experience',
      entityId: experience.id,
      bookingState: 'on',
    })
    startTransition(async () => {
      const result = await createCheckoutSessionAction(
        experience.id,
        { availabilityId: selectedId, qty, guestEmail },
        { locale, ...(sourceSurface ? { sourceSurface } : {}), ...(guideSlug ? { guideSlug } : {}) },
      )
      if (!result.ok) {
        trackTravellerEvent('checkout_started', {
          locale,
          routeKey: 'experience_detail',
          entityType: 'experience',
          entityId: experience.id,
          bookingState: 'on',
          outcome: 'error',
          errorCategory: Object.keys(result.errors).some((key) => key !== 'form') ? 'invalid' : 'unavailable',
        })
        setError(
          result.errors.form?.[0] ??
            result.errors.availabilityId?.[0] ??
            result.errors.qty?.[0] ??
            result.errors.guestEmail?.[0] ??
            t.genericError,
        )
        return
      }
      trackTravellerEvent('checkout_started', {
        locale,
        routeKey: 'experience_detail',
        entityType: 'experience',
        entityId: experience.id,
        bookingState: 'on',
        outcome: 'created',
      })
      window.location.href = result.checkoutUrl
    })
  }

  if (availability.length === 0) {
    return (
      <div className="mt-6 rounded-[3px] border border-kinnso-edge bg-white px-4 py-3">
        <p className="text-sm font-semibold text-kinnso-ink">{t.noAvailability}</p>
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-[3px] border border-kinnso-edge bg-white px-4 py-4">
      <label className="block text-xs font-bold uppercase tracking-wide text-kinnso-muted" htmlFor="booking-date">
        {t.selectDateLabel}
      </label>
      <select
        id="booking-date"
        className="mt-1 w-full rounded-[3px] border border-kinnso-edge px-3 py-2 text-sm"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {availability.map((a) => (
          <option key={a.id} value={a.id} disabled={a.remaining === 0}>
            {a.date} — {a.remaining === 0 ? t.soldOutLabel : `${a.remaining} ${t.spotsLeftLabel}`}
          </option>
        ))}
      </select>

      <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-kinnso-muted" htmlFor="booking-qty">
        {t.qtyLabel}
      </label>
      <input
        id="booking-qty"
        type="number"
        min={1}
        max={selected?.remaining ?? 1}
        className="mt-1 w-full rounded-[3px] border border-kinnso-edge px-3 py-2 text-sm"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />

      {!viewerEmail ? (
        <>
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-kinnso-muted" htmlFor="booking-email">
            {t.guestEmailLabel}
          </label>
          <input
            id="booking-email"
            type="email"
            placeholder={t.guestEmailPlaceholder}
            className="mt-1 w-full rounded-[3px] border border-kinnso-edge px-3 py-2 text-sm"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-kinnso-muted">{t.guestEmailHint}</p>
        </>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={isPending || !selected || selected.remaining === 0}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? t.submittingCta : t.submitCta}
      </button>
    </div>
  )
}

export default BookingWidget
