import Link from 'next/link'
import type { Dna } from '@kinnso/scan'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import { TicketCard } from '@/components/kinnso/MarketPassport'

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  threads: 'Threads',
}

function formatFollowers(n?: number): string {
  if (!n || n <= 0) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

/** Compact, real-DNA-only summary for the Studio dashboard. Not the full report. */
export function DnaSnapshotCard({
  locale,
  t,
  dna,
  lastScanned,
}: {
  locale: Locale
  t: Messages['studioDashboard']
  dna: Dna
  lastScanned: string // ISO
}) {
  const date = lastScanned.slice(0, 10)
  return (
    <TicketCard className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.dnaSnapshotTitle}</h2>
        <span className="text-xs text-kinnso-muted">{t.dnaLastScanned.replace('{date}', date)}</span>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.dnaNiches}</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {dna.niches.map((n) => (
              <span key={n} className="k-pill bg-kinnso-cream2 text-kinnso-ink">{n}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.dnaPillars}</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {dna.content_pillars.map((p) => (
              <span key={p} className="k-pill bg-kinnso-cream2 text-kinnso-ink">{p}</span>
            ))}
          </dd>
        </div>
      </dl>

      <ul className="mt-3 flex flex-wrap gap-3 text-sm text-kinnso-muted">
        {dna.platforms.map((p) => (
          <li key={p.platform}>
            <span className="font-semibold text-kinnso-ink">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>{' '}
            {formatFollowers(p.followers)}
          </li>
        ))}
      </ul>

      <Link href={`/${locale}/studio/scan`} className="mt-4 inline-flex text-sm font-bold text-kinnso-orange">
        {t.viewFullReport}
      </Link>
    </TicketCard>
  )
}

export default DnaSnapshotCard
