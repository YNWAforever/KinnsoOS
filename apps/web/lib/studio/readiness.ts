import type { Platform } from '@kinnso/scan'

export type ReadinessItemId = 'dna-ready' | 'write-guide' | 'connect-platforms' | 'dna-fresh'

export interface ReadinessDetail {
  platformGap?: { connected: number; total: number; missing: Platform[] }
  freshness?: { days: number; stale: boolean }
}

export interface ReadinessItem {
  id: ReadinessItemId
  done: boolean
  detail: ReadinessDetail
}

export interface Readiness {
  items: ReadinessItem[]
  doneCount: number
  total: number
}

/** The three platforms a creator should connect for full discoverability. */
export const REQUIRED_PLATFORMS: Platform[] = ['instagram', 'youtube', 'threads']

/** DNA older than this many days is considered stale (flips the dna-fresh item). */
export const FRESH_MAX_DAYS = 30

const MS_PER_DAY = 86_400_000

/**
 * Pure readiness computation for the Studio dashboard checklist.
 * `now` is injected so the result is deterministic and unit-testable.
 */
export function computeReadiness(input: {
  handles: { platform: Platform }[]
  guidesCount: number
  dnaUpdatedAtIso: string
  now: Date
}): Readiness {
  const connected = new Set(input.handles.map((h) => h.platform))
  const missing = REQUIRED_PLATFORMS.filter((p) => !connected.has(p))

  const ageMs = input.now.getTime() - new Date(input.dnaUpdatedAtIso).getTime()
  const days = Math.max(0, Math.floor(ageMs / MS_PER_DAY))
  const stale = days > FRESH_MAX_DAYS

  const items: ReadinessItem[] = [
    { id: 'dna-ready', done: true, detail: {} },
    { id: 'write-guide', done: input.guidesCount >= 1, detail: {} },
    {
      id: 'connect-platforms',
      done: missing.length === 0,
      detail: { platformGap: { connected: REQUIRED_PLATFORMS.length - missing.length, total: REQUIRED_PLATFORMS.length, missing } },
    },
    { id: 'dna-fresh', done: !stale, detail: { freshness: { days, stale } } },
  ]

  return { items, doneCount: items.filter((i) => i.done).length, total: items.length }
}
