import Link from 'next/link'
import type { Dna, Platform } from '@kinnso/scan'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Readiness } from '@/lib/studio/readiness'
import type { EarningsCurrencyTotal } from '@/lib/missions/earnings'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { DnaSnapshotCard } from '@/components/kinnso/DnaSnapshotCard'
import type { StudioNextAction } from '@/lib/studio/next-action'
import type { DirectoryGap } from '@/lib/creators/eligibility'
import { StudioReadinessChecklist } from '@/components/kinnso/StudioReadinessChecklist'
import { StudioQuickLinks } from '@/components/kinnso/StudioQuickLinks'
import { AddHandleDialog } from '@/components/kinnso/AddHandleDialog'
import { StudioRescanButton } from '@/components/kinnso/StudioRescanButton'
import { TierProgressCard } from '@/components/kinnso/TierProgressCard'
import type { CreatorContribution } from '@/lib/contribution/queries'

export interface OpportunityPreview {
  id: string
  title: string
  kind: 'mission' | 'offer'
}

export interface StudioDashboardViewProps {
  locale: Locale
  t: Messages['studioDashboard']
  studioHomeT: Messages['studioHome']
  progressT: Messages['onboarding']['progressStep']
  creatorId: string
  name: string
  dna: Dna
  lastScanned: string // ISO
  readiness: Readiness
  nextAction: StudioNextAction
  directory: { listed: boolean; gaps: DirectoryGap[] }
  opportunities: OpportunityPreview[]
  earnings: EarningsCurrencyTotal[]
  platforms: Platform[]
  missingPlatforms: Platform[]
  activeJobId: string | null
  contribution: CreatorContribution
  tierT: Messages['tier']
  unreadNotificationCount: number
}

export function StudioDashboardView(props: StudioDashboardViewProps) {
  const { locale, t, studioHomeT, progressT, creatorId, name, dna, lastScanned, readiness, nextAction, directory, opportunities, earnings, platforms, missingPlatforms, activeJobId, contribution, tierT, unreadNotificationCount } = props
  const p = (path: string) => `/${locale}${path}`
  const nextActionCopy = {
    await_scan: t.nextActionAwaitScan,
    start_earning: t.nextActionStartEarning,
    publish_guide: t.nextActionPublishGuide,
    connect_platforms: t.nextActionConnectPlatforms,
    refresh_dna: t.nextActionRefreshDna,
    nothing_open: t.nextActionNothingOpen,
  }[nextAction.kind]

  return (
    <main>
      <section className="k-container space-y-6 py-10">
        {/* 1. Greeting */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight text-kinnso-ink md:text-4xl">
            {t.greeting.replace('{name}', name)}
          </h1>
          <span className="k-pill bg-green-100 text-green-700">{t.statusActive}</span>
        </div>

        {/* 2. DNA snapshot */}
        <DnaSnapshotCard locale={locale} t={t} dna={dna} lastScanned={lastScanned} />

        {/* 2b. Tier progress */}
        <TierProgressCard locale={locale} t={tierT} contribution={contribution} />

        {/* 2b. The single next step. The checklist below says what is outstanding;
            this says which one to do first — and ranks earning above the rest,
            because that is what the contribution weights already imply. */}
        <section aria-labelledby="studio-next-step" className="rounded-2xl border border-kinnso-edge bg-white p-5">
          <h2 id="studio-next-step" className="text-sm font-bold uppercase tracking-wide text-kinnso-muted">
            {t.nextActionHeading}
          </h2>
          <p role="status" className="mt-2 text-base text-kinnso-ink">
            {nextActionCopy}
          </p>
          {nextAction.path ? (
            <Link href={p(nextAction.path)} className="k-btn-primary mt-3 inline-flex">
              {t.nextActionCta}
            </Link>
          ) : null}
        </section>

        {/* 3. Readiness checklist (hero) with interactive slots */}
        <StudioReadinessChecklist
          directory={directory}
          locale={locale}
          t={t}
          readiness={readiness}
          slots={{
            'connect-platforms': <AddHandleDialog creatorId={creatorId} missing={missingPlatforms} t={t} />,
            'dna-fresh': <StudioRescanButton creatorId={creatorId} platforms={platforms} activeJobId={activeJobId} progressT={progressT} t={t} />,
          }}
        />

        {/* 4. Opportunities */}
        <TicketCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-kinnso-ink">{t.opportunitiesTitle}</h2>
            <Link href={p('/studio/missions')} className="text-sm font-bold text-kinnso-orange">{t.opportunitiesBrowse} →</Link>
          </div>
          {opportunities.length === 0 ? (
            <p className="mt-2 text-sm text-kinnso-muted">{t.opportunitiesEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {opportunities.map((o) => (
                <li key={o.id}>
                  <Link href={p(o.kind === 'offer' ? '/studio/offers' : `/studio/missions/${o.id}`)} className="text-sm font-semibold text-kinnso-ink hover:text-kinnso-orange">
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TicketCard>

        {/* 5. Earnings */}
        <TicketCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-kinnso-ink">{t.earningsTitle}</h2>
            <Link href={p('/studio/earnings')} className="text-sm font-bold text-kinnso-orange">{t.earningsView} →</Link>
          </div>
          {earnings.length === 0 ? (
            <p className="mt-2 text-sm text-kinnso-muted"><span>$0</span> · <span>{t.earningsEmpty}</span></p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm text-kinnso-ink">
              {earnings.map((e) => (
                <li key={e.currency}>
                  <span className="font-semibold">{e.currency}</span> {e.paid.toLocaleString()} paid · {e.pending.toLocaleString()} pending
                </li>
              ))}
            </ul>
          )}
        </TicketCard>

        {/* 6. Quick links */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.quickLinksTitle}</p>
          <StudioQuickLinks locale={locale} t={studioHomeT} unreadNotificationCount={unreadNotificationCount} />
        </div>
      </section>
    </main>
  )
}

export default StudioDashboardView
