/**
 * The single next action for an active creator, derived from the snapshot
 * /studio already loads. Pure: no React, no Next, no Supabase — so the ordering
 * below is unit-testable on its own, which matters because the ordering IS the
 * product decision.
 *
 * The dashboard already lists opportunities, earnings and a readiness checklist.
 * What it never did was say which one to do next, and the existing checklist
 * (lib/studio/readiness.ts) has no earning item at all — it asks for a guide and
 * for platforms, never for the thing that pays.
 */

export interface StudioSnapshot {
  /** Connected social accounts. Proof of a promoted link is verified against these. */
  handleCount: number
  /** Required platforms not yet connected (reach, not a blocker). */
  missingPlatformCount: number
  guidesCount: number
  /** A scan is queued/fetching/analyzing right now. */
  activeScanJob: boolean
  /** Published travelpayouts missions — the earn path, open to every tier. */
  affiliateOfferCount: number
  /** Any settled earning at all. */
  hasEarnings: boolean
  dnaStale: boolean
}

export type StudioNextActionKind =
  | 'await_scan'
  | 'start_earning'
  | 'publish_guide'
  | 'connect_platforms'
  | 'refresh_dna'
  | 'nothing_open'

export interface StudioNextAction {
  kind: StudioNextActionKind
  /** Locale-free; the caller prefixes. Null when there is nothing to do. */
  path: string | null
}

/**
 * Ordering rationale, highest first:
 *
 * 1. A scan in flight — everything else depends on its result, so proposing work
 *    now would be asking for something the creator cannot yet act on.
 * 2. Earning. `mission_verified` is worth 40 contribution points against
 *    `guide_published`'s 15, travelpayouts missions cannot be tier-gated
 *    (missions_min_tier_merchant_only_check), and the payout is real money — so
 *    one verified promotion advances tier, points and income at once. It needs at
 *    least one connected account, because verification scans the creator's own
 *    post. It is proposed once: a creator with settled earnings has found the path.
 * 3. A first guide, which is what makes them appear in the public directory
 *    (fetchEligibleCreators requires a published guide, or an ops override).
 * 4. Remaining platforms — reach and more places to promote, not a blocker.
 * 5. A stale DNA refresh.
 *
 * When none applies, say so. An empty offer catalogue must never be dressed up as
 * a queue that is about to fill.
 */
export function deriveStudioNextAction(snapshot: StudioSnapshot): StudioNextAction {
  if (snapshot.activeScanJob) return { kind: 'await_scan', path: '/studio/scan' }

  const canPromote = snapshot.handleCount > 0 && snapshot.affiliateOfferCount > 0
  if (canPromote && !snapshot.hasEarnings) return { kind: 'start_earning', path: '/studio/offers' }

  if (snapshot.guidesCount === 0) return { kind: 'publish_guide', path: '/studio/guides/new' }

  if (snapshot.missingPlatformCount > 0) return { kind: 'connect_platforms', path: '/creator' }

  if (snapshot.dnaStale) return { kind: 'refresh_dna', path: '/studio/scan' }

  return { kind: 'nothing_open', path: null }
}
