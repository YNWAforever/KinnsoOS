import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { FeatureInterestForm } from '@/components/kinnso/FeatureInterestForm'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AgentTeaser({ locale, t, featureInterest, agentLive, bookingLive }: {
  locale: Locale
  t: Messages['home']
  featureInterest: Messages['featureInterest']
  agentLive: boolean
  bookingLive: boolean
}) {
  const eyebrow = agentLive ? t.agentLiveEyebrow : t.agentWaitlistEyebrow
  const title = agentLive ? t.agentLiveTitle : t.agentWaitlistTitle
  const body = agentLive
    ? (bookingLive ? t.agentLiveBodyBookingLive : t.agentLiveBodyBookingWaitlist)
    : t.agentWaitlistBody
  const note = agentLive ? t.agentLiveNote : t.agentWaitlistNote

  return (
    <section className="bg-kinnso-ink py-16 md:py-24">
      <div className="k2-container">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-amber">{eyebrow}</p>
        <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso-cream md:text-4xl">{title}</h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-cream/70">{body}</p>
        {agentLive ? (
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href={`/${locale}/agent`} className="k2-btn-primary">
              {t.agentLiveCta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <p className="text-sm text-kinnso-cream/70">{note}</p>
          </div>
        ) : (
          <div className="mt-8 max-w-xl">
            <p className="mb-4 text-sm text-kinnso-cream/70">{note}</p>
            <div className="k2-card bg-kinnso-cream p-5">
              <FeatureInterestForm feature="agent" locale={locale} t={featureInterest} />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
