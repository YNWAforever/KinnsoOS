import type { Messages } from '@/lib/i18n/messages/en'
import { TierBadge } from '@/components/kinnso/admin/creators/badges'

type Row = { creatorId: string; displayName: string | null; points: number; tier: string }

export function Leaderboard({ t, rows }: { t: Messages['creators']; rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-kinnso-muted">{t.leaderboardEmpty}</p>
  }
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={r.creatorId} className="flex items-center gap-3 text-sm">
          <span className="w-5 text-right font-black text-kinnso-muted">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.displayName ?? '—'}</span>
          <TierBadge tier={r.tier} t={t} />
          <span className="tabular-nums font-bold text-kinnso-ink">{r.points}</span>
          <span className="text-kinnso-muted">{t.points}</span>
        </li>
      ))}
    </ol>
  )
}

export default Leaderboard
