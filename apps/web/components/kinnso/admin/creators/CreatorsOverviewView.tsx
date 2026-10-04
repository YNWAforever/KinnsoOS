import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { CreatorsOverview } from '@/lib/admin/creators-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/TrendChart'
import { Leaderboard } from '@/components/kinnso/admin/creators/Leaderboard'
import { CreatorsTabs } from '@/components/kinnso/admin/creators/CreatorsTabs'

const REASON_LABEL = (t: Messages['creators']): Record<string, string> => ({
  scan_failed: t.reasonScanFailed,
  no_active_missions: t.reasonNoMissions,
})

export function CreatorsOverviewView({ t, locale, overview }: { t: Messages['creators']; locale: Locale; overview: CreatorsOverview }) {
  const { kpis, signups, engagement, leaderboard, atRisk, recentActivity } = overview
  const reasons = REASON_LABEL(t)
  const kpiCards = [
    { label: t.kpiTotal, value: kpis.total },
    { label: t.kpiActive, value: kpis.byStatus.active ?? 0 },
    { label: t.kpiSuspended, value: kpis.byStatus.suspended ?? 0 },
    { label: t.kpiOnboarding, value: kpis.byStatus.onboarding ?? 0 },
    { label: t.kpiNew, value: kpis.newInPeriod, delta: kpis.newInPeriod - kpis.newPrevPeriod },
    { label: t.kpiPayoutsPending, value: kpis.payoutsPending },
  ]
  return (
    <main>
      <CreatorsTabs t={t} locale={locale} />
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {kpiCards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.value} delta={c.delta} />
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendSignups}</p>
          <TrendChart points={signups.map((s) => ({ label: s.day, value: s.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendSignups} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendEngagement}</p>
          <TrendChart points={engagement.map((e) => ({ label: e.day, value: e.points }))} emptyText={t.trendEmpty} ariaLabel={t.trendEngagement} />
        </TicketCard>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.leaderboardTitle}</p>
          <Leaderboard t={t} rows={leaderboard} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.atRiskTitle}</p>
          {atRisk.length === 0 ? (
            <p className="py-6 text-sm text-kinnso-muted">{t.atRiskEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {atRisk.map((r) => (
                <li key={r.creatorId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.displayName ?? '—'}</span>
                  <span className="text-orange-700">{reasons[r.reason] ?? r.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </TicketCard>
      </div>

      <TicketCard className="mt-8 p-5">
        <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.activityTitle}</p>
        {recentActivity.length === 0 ? (
          <p className="py-6 text-sm text-kinnso-muted">{t.activityEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {recentActivity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span className="font-bold text-kinnso-ink">{a.action}</span>
                <span className="min-w-0 flex-1 truncate text-kinnso-muted">{a.reason ?? ''}</span>
                <span className="shrink-0 text-kinnso-muted">{a.createdAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </TicketCard>
    </main>
  )
}

export default CreatorsOverviewView
