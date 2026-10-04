/**
 * What crossing into the next tier actually buys, read from the live perk catalog.
 *
 * `/studio/tier` showed points and thresholds — a number to climb toward with no
 * stated reward. The ladder does pay off (`partner_perks.min_tier`, hard-gated by
 * the redemption RPC), so the reward exists; it was just never named.
 *
 * Pure: no React, no Supabase. The caller fetches the catalog.
 */
import type { GatedTier, TierProgress } from '@/lib/contribution/tiers'
import type { ActivePerk } from '@/lib/perks/queries'

export interface NextTierPerk {
  title: string
  partnerName: string
}

export interface NextTierUnlocks {
  nextTier: GatedTier
  /** Points still needed. Concrete, so the ask is a number and not "keep going". */
  pointsForNext: number
  /**
   * Perks gated at exactly the next tier — what crossing it unlocks. Perks gated
   * lower are already available, and perks gated higher stay locked, so neither
   * belongs here. May be empty; the caller must say so plainly rather than
   * substitute a perk from another tier.
   */
  perks: NextTierPerk[]
}

export function nextTierUnlocks(
  progress: TierProgress,
  perks: ActivePerk[],
): NextTierUnlocks | null {
  // `elite` has nothing above it. Saying so is the honest render; fabricating a
  // next rung would be worse than an empty panel.
  if (progress.nextTier === null || progress.pointsForNext === null) return null
  const nextTier = progress.nextTier as GatedTier

  return {
    nextTier,
    pointsForNext: progress.pointsForNext,
    perks: perks
      .filter((p) => p.min_tier === nextTier)
      .map((p) => ({ title: p.title, partnerName: p.partner_name })),
  }
}
