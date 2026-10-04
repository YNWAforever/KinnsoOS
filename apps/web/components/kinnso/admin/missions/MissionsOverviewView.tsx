import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MissionsOverview, MissionAttention } from '@/lib/admin/missions-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/TrendChart'
import { MissionsTabs } from '@/components/kinnso/admin/missions/MissionsTabs'

const REASON_LABEL = (t: Messages['missionsOps']): Record<string, string> => ({
  published_no_participants: t.reasonPublishedNoParticipants,
  stalled_submissions: t.reasonStalledSubmissions,
  verification_failed: t.reasonVerificationFailed,
})

export function MissionsOverviewView({ t, locale, overview, attention }: { t: Messages['missionsOps']; locale: Locale; overview: MissionsOverview; attention: MissionAttention }) {
  const { kpis, missionsCreated, submissionsReviewed, atRisk } = overview
  // attention.atRiskMissions is deliberately unused below: it's the same at-risk data already
  // rendered from `overview.atRisk` above, via admin_mission_analytics -- a second list would
  // just duplicate it. Only attention.overdueReviews is new, rendered further down.
  const reasons = REASON_LABEL(t)
  const kpiCards = [
    { label: t.kpiTotal, value: kpis.total },
    { label: t.kpiPublished, value: kpis.byStatus.published ?? 0 },
    { label: t.kpiDraft, value: kpis.byStatus.draft ?? 0 },
    { label: t.kpiPaused, value: kpis.byStatus.paused ?? 0 },
    { label: t.kpiCompleted, value: kpis.byStatus.completed ?? 0 },
    { label: t.kpiCancelled, value: kpis.byStatus.cancelled ?? 0 },
    { label: t.kpiOpenForApplications, value: kpis.openForApplications },
  ]
  return (
    <main>
      <MissionsTabs t={t} locale={locale} />
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {kpiCards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.value} />
        ))}
        <TicketCard
          as={Link}
          href={`/${locale}/admin/missions/review`}
          className="group p-5 transition hover:border-kinnso-orange"
        >
          <p className="text-3xl font-black text-kinnso-ink">{kpis.submissionsAwaitingReview}</p>
          <p className="mt-1 text-sm text-kinnso-muted">{t.kpiSubmissionsAwaitingReview}</p>
          <span className="mt-3 inline-flex items-center text-sm font-bold text-kinnso-orange">
            {t.viewQueue} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </TicketCard>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendMissionsCreated}</p>
          <TrendChart points={missionsCreated.map((m) => ({ label: m.day, value: m.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendMissionsCreated} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendSubmissionsReviewed}</p>
          <TrendChart points={submissionsReviewed.map((s) => ({ label: s.day, value: s.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendSubmissionsReviewed} />
        </TicketCard>
      </div>

      <TicketCard className="mt-8 p-5">
        <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.atRiskTitle}</p>
        {atRisk.length === 0 ? (
          <p className="py-6 text-sm text-kinnso-muted">{t.atRiskEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {atRisk.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                {/*
                  /admin/missions/[missionId] was reachable by no link anywhere in the
                  product, yet mission-review-actions revalidates it after every decision
                  -- ops could act on a submission but never open the mission it belonged
                  to. The at-risk list already carries the mission id, so this is the
                  natural way in.
                */}
                <Link
                  href={`/${locale}/admin/missions/${r.id}`}
                  className="min-w-0 flex-1 truncate font-bold text-kinnso-ink underline decoration-kinnso-edge underline-offset-4 hover:decoration-kinnso-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
                >
                  {r.title}
                </Link>
                <span className="min-w-0 flex-1 truncate text-kinnso-muted">{r.merchantName ?? '—'}</span>
                <span className="shrink-0 text-orange-700">{reasons[r.reason] ?? r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </TicketCard>

      <TicketCard className="mt-8 p-5">
        <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.attentionOverdueTitle}</p>
        {attention.overdueReviews.length === 0 ? (
          <p className="py-6 text-sm text-kinnso-muted">{t.attentionOverdueEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {attention.overdueReviews.map((r) => (
              <li key={r.submissionId} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.missionTitle}</span>
                <span className="shrink-0 text-orange-700">{new Date(r.reviewDeadline).toLocaleDateString(locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </TicketCard>
    </main>
  )
}

export default MissionsOverviewView
