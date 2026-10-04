import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantsOverview } from '@/lib/admin/merchants-queries'

export function MerchantsLeaderboard({ t, rows }: { t: Messages['merchantsOps']; rows: MerchantsOverview['leaderboard'] }) {
  if (rows.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.leaderboardEmpty}</p>
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.companyName ?? '—'}</span>
          <span className="shrink-0 text-kinnso-muted">{r.missionsCount} {t.lbMissions} · {r.creatorsEngaged} {t.lbCreators}</span>
        </li>
      ))}
    </ul>
  )
}

export default MerchantsLeaderboard
