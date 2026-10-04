import type { Messages } from '@/lib/i18n/messages/en'
import type { AdminOverview } from '@/lib/admin/queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'

export function AdminDashboardView({ t, overview }: { t: Messages['admin']; overview: AdminOverview }) {
  const stats = [
    { label: t.statCreators, value: overview.creators },
    { label: t.statMerchants, value: overview.merchants },
    { label: t.statOps, value: overview.ops },
    { label: t.statPerksActive, value: overview.perksActive },
    { label: t.statPerksTotal, value: overview.perksTotal },
    { label: t.statRedemptions, value: overview.redemptions },
  ]
  return (
    <main>
      <h1 className="k-display">{t.dashboardTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.dashboardSubtitle}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <TicketCard key={s.label} className="p-5">
            <p className="text-3xl font-black text-kinnso-ink">{s.value}</p>
            <p className="mt-1 text-sm text-kinnso-muted">{s.label}</p>
          </TicketCard>
        ))}
      </div>
    </main>
  )
}

export default AdminDashboardView
