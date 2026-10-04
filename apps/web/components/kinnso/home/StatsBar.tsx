import { STAT_THRESHOLDS, type PlatformStats } from '@/lib/home/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * Section 2 — social-proof bar. Shows the four R7.4 platform-scale metrics
 * only after their individual thresholds are met. When any metric is hidden,
 * one localized qualitative chip communicates growth without inventing a number.
 * Server component; numbers formatted per locale.
 */
export function StatsBar({ locale, t, stats }: { locale: Locale; t: Messages['home']; stats: PlatformStats | null }) {
  if (!stats) return null
  const candidates = [
    { key: 'creators', value: stats.activeCreators, min: STAT_THRESHOLDS.activeCreators, label: t.statCreators },
    { key: 'guides', value: stats.publishedGuides, min: STAT_THRESHOLDS.publishedGuides, label: t.statGuides },
    { key: 'destinations', value: stats.destinations, min: STAT_THRESHOLDS.destinations, label: t.statDestinations },
    { key: 'bookings', value: stats.completedBookings, min: STAT_THRESHOLDS.completedBookings, label: t.statCompletedBookings },
  ]
  const entries = candidates.filter((candidate) => candidate.value >= candidate.min)
  const hasSubThresholdMetric = entries.length < candidates.length
  const fmt = new Intl.NumberFormat(locale)

  return (
    <div className="border-b border-kinnso-edge bg-kinnso-cream">
      <ul className="k2-container flex flex-wrap items-baseline gap-x-12 gap-y-4 py-8">
        {entries.map((stat) => (
          <li key={stat.key} className="flex items-baseline gap-2">
            <span className="k2-display text-3xl font-semibold text-kinnso-ink">{fmt.format(stat.value)}</span>
            <span className="text-sm text-kinnso-ink/70">{stat.label}</span>
          </li>
        ))}
        {hasSubThresholdMetric ? (
          <li key="growing-fast">
            <span className="inline-flex rounded-full border border-kinnso-edge bg-white px-4 py-2 text-sm font-semibold text-kinnso-ink">
              {t.statGrowingFast}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  )
}
