'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { FeatureInterestForm } from '@/components/kinnso/FeatureInterestForm'
import { hasAnalyticsConsent, subscribeToAnalyticsConsent, trackTravellerEvent } from '@/lib/analytics/client'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AgentWaitlistView({ locale, t, featureInterest }: {
  locale: Locale
  t: Messages['agent']
  featureInterest: Messages['featureInterest']
}) {
  const consented = useSyncExternalStore(subscribeToAnalyticsConsent, hasAnalyticsConsent, () => false)
  const tracked = useRef(false)
  const initialLocale = useRef(locale)

  useEffect(() => {
    if (!consented || tracked.current) return
    tracked.current = true
    trackTravellerEvent('agent_started', { locale: initialLocale.current, routeKey: 'agent' })
  }, [consented])

  return (
    <main className="k2-container py-16">
      <section className="k2-card mx-auto max-w-2xl p-8 md:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-orangeDark">{t.eyebrow}</p>
        <h1 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink">{t.waitlistTitle}</h1>
        <p className="mt-3 leading-relaxed text-kinnso-muted">{t.waitlistBody}</p>
        <div className="mt-8">
          <FeatureInterestForm feature="agent" locale={locale} t={featureInterest} />
        </div>
      </section>
    </main>
  )
}

export default AgentWaitlistView
