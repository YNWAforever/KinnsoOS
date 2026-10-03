'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import { getAnalyticsMode } from '@/lib/analytics/config'
import {
  grantAnalyticsConsent,
  hasAnalyticsConsent,
  revokeAnalyticsConsent,
  subscribeToAnalyticsConsent,
} from '@/lib/analytics/client'

const getAnalyticsConsentServerSnapshot = () => false

export function AnalyticsConsentBanner({ locale, t }: { locale: Locale; t: Messages['analytics'] }) {
  const disabled = getAnalyticsMode({ NEXT_PUBLIC_ANALYTICS_MODE: process.env.NEXT_PUBLIC_ANALYTICS_MODE }) === 'disabled'
  const storedConsent = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    hasAnalyticsConsent,
    getAnalyticsConsentServerSnapshot,
  )
  const [acceptedOverride, setAcceptedOverride] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const accepted = acceptedOverride ?? storedConsent

  if (disabled || dismissed) return null

  if (accepted) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          className="rounded-md border border-kinnso-ink bg-kinnso-cream px-3 py-2 text-sm font-semibold text-kinnso-ink shadow-sm"
          onClick={() => { revokeAnalyticsConsent(); setAcceptedOverride(false) }}
        >
          {t.changePreference}
        </button>
      </div>
    )
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-description"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-xl rounded-lg border border-kinnso-ink bg-kinnso-cream p-4 shadow-lg"
    >
      <h2 id="analytics-consent-title" className="text-base font-bold">{t.title}</h2>
      <p id="analytics-consent-description" className="mt-1 text-sm">{t.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-md bg-kinnso-ink px-3 py-2 text-sm font-semibold text-kinnso-cream" onClick={() => { setAcceptedOverride(grantAnalyticsConsent(locale)) }}>
          {t.accept}
        </button>
        <button type="button" className="rounded-md border border-kinnso-ink px-3 py-2 text-sm font-semibold" onClick={() => { revokeAnalyticsConsent(); setDismissed(true) }}>
          {t.decline}
        </button>
      </div>
    </section>
  )
}
