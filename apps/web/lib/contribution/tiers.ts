/**
 * Canonical creator tier ladder + contribution scoring.
 * SINGLE SOURCE OF TRUTH for thresholds + weights. The SQL migration
 * (supabase/migrations/20260625090000_creator_contribution_backbone.sql)
 * MIRRORS these numbers — keep both in sync.
 */
export const TIERS = ['seed', 'rising', 'pro', 'elite'] as const
export type Tier = (typeof TIERS)[number]

export const POINT_WEIGHTS = {
  dna_scan: 10,
  guide_published: 15,
  mission_verified: 40,
} as const
export type ContributionEventType = keyof typeof POINT_WEIGHTS

/** Ascending by `min`. tierForPoints relies on this order. */
export const TIER_THRESHOLDS: ReadonlyArray<{ tier: Tier; min: number }> = [
  { tier: 'seed', min: 0 },
  { tier: 'rising', min: 50 },
  { tier: 'pro', min: 150 },
  { tier: 'elite', min: 400 },
]

export function tierForPoints(points: number): Tier {
  const p = Math.max(0, Math.floor(points))
  let result: Tier = 'seed'
  for (const t of TIER_THRESHOLDS) {
    if (p >= t.min) result = t.tier
  }
  return result
}

export interface TierProgress {
  tier: Tier
  nextTier: Tier | null
  points: number
  pointsIntoTier: number
  pointsForNext: number | null
  pct: number // 0..100 within the current band
}

export function progressToNext(points: number): TierProgress {
  const p = Math.max(0, Math.floor(points))
  const tier = tierForPoints(p)
  const idx = TIER_THRESHOLDS.findIndex((t) => t.tier === tier)
  const currentMin = TIER_THRESHOLDS[idx].min
  const next = TIER_THRESHOLDS[idx + 1] ?? null
  if (!next) {
    return { tier, nextTier: null, points: p, pointsIntoTier: p - currentMin, pointsForNext: null, pct: 100 }
  }
  const band = next.min - currentMin
  const into = p - currentMin
  const pct = Math.min(100, Math.max(0, Math.round((into / band) * 100)))
  return { tier, nextTier: next.tier, points: p, pointsIntoTier: into, pointsForNext: next.min - p, pct }
}

/** Tiers that can gate a mission. `seed` is excluded — everyone is >= seed, so a
 *  seed gate is meaningless and `null` is the canonical "open to all" value. */
export type GatedTier = Exclude<Tier, 'seed'>

/** Position of a tier in the ladder. Mirrors SQL public.contribution_tier_rank. */
export function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier)
}

/** True when `creatorTier` satisfies `required`. A null requirement is always met. */
export function meetsTier(creatorTier: Tier, required: GatedTier | null): boolean {
  if (required === null) return true
  return tierRank(creatorTier) >= tierRank(required)
}
