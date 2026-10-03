import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorContribution, ContributionEvent } from '@/lib/contribution/queries'
import { TIER_THRESHOLDS } from '@/lib/contribution/tiers'
import type { GatedTier } from '@/lib/contribution/tiers'
import type { NextTierUnlocks } from '@/lib/perks/next-tier'
import { tierMeta } from '@/lib/creator-mock'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import TierBadge from '@/components/kinnso/TierBadge'

const EVENT_LABEL_KEY = {
  guide_published: 'eventGuide',
  mission_verified: 'eventMission',
  dna_scan: 'eventScan',
} as const

export function StudioTierView({
  t,
  contribution,
  events,
  gatedCounts,
  nextUnlocks,
}: {
  t: Messages['tier']
  contribution: CreatorContribution
  events: ContributionEvent[]
  gatedCounts: Record<GatedTier, number>
  /**
   * Null when the perk catalog could not be read — the panel is omitted rather
   * than rendered empty, because "nothing is gated there" and "we could not look"
   * are different claims and only one of them is true.
   */
  nextUnlocks: { unlocks: NextTierUnlocks | null } | null
}) {
  const { tier, points } = contribution
  return (
    <main>
      <section className="k-container space-y-6 py-10">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-kinnso-ink md:text-4xl">{t.pageHeading}</h1>
          <p className="mt-1 text-kinnso-muted">{t.pageSubtitle}</p>
        </div>

        {/* Current status */}
        <TicketCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.currentLabel}</p>
          <div className="mt-2 flex items-center gap-3">
            <TierBadge tier={tier} />
            <span className="k-mono text-sm text-kinnso-muted">
              {points} {t.pointsSuffix}
            </span>
          </div>
        </TicketCard>

        {/* What the NEXT tier buys, from the live perk catalog. The ladder does pay
            off — partner_perks.min_tier is hard-gated by the redemption RPC — but
            this page showed a number to climb toward and never named the reward. */}
        {nextUnlocks && (
          <TicketCard as="section" className="p-5" aria-labelledby="next-unlocks-heading">
            <h2 id="next-unlocks-heading" className="text-lg font-bold text-kinnso-ink">
              {t.nextUnlocksHeading}
            </h2>
            {nextUnlocks.unlocks === null ? (
              <p className="mt-2 text-sm text-kinnso-muted">
                {t.nextUnlocksMaxed.replace('{tier}', tierMeta[tier].label)}
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-kinnso-muted">
                  {t.nextUnlocksIntro
                    .replace('{points}', String(nextUnlocks.unlocks.pointsForNext))
                    .replace('{tier}', tierMeta[nextUnlocks.unlocks.nextTier].label)}
                </p>
                {/* Empty is said plainly. Borrowing a perk from another tier to fill
                    the space would promise something crossing this one does not buy. */}
                {nextUnlocks.unlocks.perks.length === 0 ? (
                  <p className="mt-2 text-sm text-kinnso-muted">
                    {t.nextUnlocksNone.replace('{tier}', tierMeta[nextUnlocks.unlocks.nextTier].label)}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {nextUnlocks.unlocks.perks.map((perk) => (
                      <li key={`${perk.partnerName}-${perk.title}`} className="text-sm">
                        <span className="font-semibold text-kinnso-ink">{perk.title}</span>
                        <span className="text-kinnso-muted"> · {perk.partnerName}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </TicketCard>
        )}

        {/* All tiers */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.allTiersHeading}</h2>
          <ul className="mt-3 space-y-2">
            {TIER_THRESHOLDS.map((row) => (
              <li key={row.tier} className="flex items-center justify-between">
                <TierBadge tier={row.tier} />
                <span className="k-mono text-sm text-kinnso-muted">
                  {row.min}+ {t.pointsSuffix}
                </span>
              </li>
            ))}
          </ul>
        </TicketCard>

        {/* What you unlock */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.unlocksHeading}</h2>
          <ul className="mt-3 space-y-2">
            {(['rising', 'pro', 'elite'] as const).map((gt) => (
              <li key={gt} className="flex items-center justify-between">
                <TierBadge tier={gt} />
                <span className="k-mono text-sm text-kinnso-muted">
                  {gatedCounts[gt]} {t.unlocksMissions}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-kinnso-muted">{t.unlocksHelp}</p>
        </TicketCard>

        {/* Points history */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.historyHeading}</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-kinnso-muted">{t.historyEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-kinnso-ink">{t[EVENT_LABEL_KEY[e.eventType]]}</span>
                  <span className="k-mono text-kinnso-muted">
                    +{e.points} {t.pointsSuffix}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TicketCard>
      </section>
    </main>
  )
}

export default StudioTierView
