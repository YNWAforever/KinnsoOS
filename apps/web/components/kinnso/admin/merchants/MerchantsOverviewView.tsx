import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MerchantsOverview } from '@/lib/admin/merchants-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/TrendChart'
import { MerchantsLeaderboard } from '@/components/kinnso/admin/merchants/MerchantsLeaderboard'
import { MerchantsTabs } from '@/components/kinnso/admin/merchants/MerchantsTabs'

const REASON_LABEL = (t: Messages['merchantsOps']): Record<string, string> => ({
  growth_idle: t.reasonGrowthIdle,
  disputed: t.reasonDisputed,
  pending_overdue: t.reasonPendingOverdue,
})

export function MerchantsOverviewView({ t, locale, overview }: { t: Messages['merchantsOps']; locale: Locale; overview: MerchantsOverview }) {
  const { kpis, signups, missionsCreated, leaderboard, atRisk, recentActivity } = overview
  const reasons = REASON_LABEL(t)
  const kpiCards = [
    { label: t.kpiTotal, value: kpis.total },
    { label: t.kpiActive, value: kpis.byStatus.active ?? 0 },
    { label: t.kpiPaused, value: kpis.byStatus.paused ?? 0 },
    { label: t.kpiSuspended, value: kpis.byStatus.suspended ?? 0 },
    { label: t.kpiArchived, value: kpis.byStatus.archived ?? 0 },
    { label: t.kpiFree, value: kpis.byTier.free ?? 0 },
    { label: t.kpiGrowth, value: kpis.byTier.growth ?? 0 },
    { label: t.kpiNew, value: kpis.newInPeriod, delta: kpis.newInPeriod - kpis.newPrevPeriod },
    { label: t.kpiMissionsLive, value: kpis.missionsLive },
    { label: t.kpiSettlementsPending, value: kpis.settlementsPending },
  ]
  return (
    <main>
      <MerchantsTabs t={t} locale={locale} />
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
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendMissions}</p>
          <TrendChart points={missionsCreated.map((m) => ({ label: m.day, value: m.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendMissions} />
        </TicketCard>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.leaderboardTitle}</p>
          <MerchantsLeaderboard t={t} rows={leaderboard} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.atRiskTitle}</p>
          {atRisk.length === 0 ? (
            <p className="py-6 text-sm text-kinnso-muted">{t.atRiskEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {atRisk.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.companyName ?? '—'}</span>
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

export default MerchantsOverviewView
