import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorContribution } from '@/lib/contribution/queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import TierBadge from '@/components/kinnso/TierBadge'
import { tierMeta } from '@/lib/creator-mock'

/** Creator-private tier + progress card for the Studio dashboard. */
export function TierProgressCard({
  locale,
  t,
  contribution,
}: {
  locale: Locale
  t: Messages['tier']
  contribution: CreatorContribution
}) {
  const { tier, nextTier, points, pct, pointsForNext } = contribution
  return (
    <TicketCard className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.cardTitle}</h2>
        <Link
          href={`/${locale}/studio/tier`}
          className="inline-flex items-center text-sm font-bold text-kinnso-orange"
        >
          {t.viewAll} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <TierBadge tier={tier} />
        <span className="k-mono text-sm text-kinnso-muted">
          {points} {t.pointsSuffix}
        </span>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-kinnso-cream2">
          <div className="h-full bg-kinnso-orange" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm text-kinnso-muted">
          {nextTier && pointsForNext !== null
            ? t.toNext.replace('{points}', String(pointsForNext)).replace('{tier}', tierMeta[nextTier].label)
            : t.maxed}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.earnHeading}</p>
        <ul className="mt-1 space-y-1 text-sm text-kinnso-ink">
          <li>{t.earnMission}</li>
          <li>{t.earnGuide}</li>
          <li>{t.earnScan}</li>
        </ul>
      </div>
    </TicketCard>
  )
}

export default TierProgressCard
