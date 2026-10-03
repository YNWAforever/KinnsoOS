import { extendedCreators } from './data'
import type { ExtendedCreator, ScoreBreakdown } from './types'

// ─── getCreator (creatorProfile.ts, verbatim) ─────────────────
export function getCreator(handle: string): ExtendedCreator | undefined {
  return extendedCreators.find((c) => c.handle === handle)
}

// ─── computeBreakdown (creatorProfile.ts, verbatim math) ──────
export function computeBreakdown(c: ExtendedCreator): ScoreBreakdown {
  const MAX = 1_000_000
  const erNorm = Math.min(c.er / 0.12, 1)
  const travelShare = 0.68 // fixed mock placeholder — carried verbatim from the source matchScore mock; does not vary per creator
  const countryDiv = Math.min(1, c.countries / 10)
  const recency = 0.71 // fixed mock placeholder — carried verbatim from the source matchScore mock; does not vary per creator
  const reach = (30 * Math.log(Math.max(2, c.totalReach))) / Math.log(MAX)
  const er = 25 * erNorm
  const travel = 20 * travelShare
  const diversity = 15 * countryDiv
  const rec = 10 * recency
  return {
    reach: +reach.toFixed(1),
    er: +er.toFixed(1),
    travel: +travel.toFixed(1),
    diversity: +diversity.toFixed(1),
    recency: +rec.toFixed(1),
    total: +(reach + er + travel + diversity + rec).toFixed(1),
  }
}
