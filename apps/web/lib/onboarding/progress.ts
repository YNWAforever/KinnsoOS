import type { Platform } from './validateHandle'

/**
 * Pure reconcile + render helpers for the live-progress step (SP2 §6 step 3).
 * The `progress` jsonb shape is PINNED by Plan 3:
 *   { platforms: { instagram?: S; youtube?: S; threads?: S }; thin?: boolean }
 *   where S = 'pending' | 'ok' | 'failed'.
 */
export type SignalState = 'pending' | 'ok' | 'failed'
export type JobStatus = 'queued' | 'fetching' | 'analyzing' | 'ready' | 'failed'

export interface JobProgress {
  platforms: Partial<Record<Platform, SignalState>>
  thin?: boolean
}

export interface JobRow {
  id: string
  status: JobStatus
  progress: JobProgress | null
  error: string | null
}

/** Monotonic ordering of the job state machine; terminal states rank highest. */
const RANK: Record<JobStatus, number> = {
  queued: 0,
  fetching: 1,
  analyzing: 2,
  ready: 3,
  failed: 3,
}

/**
 * Reconcile an initial DB snapshot with the latest realtime frame.
 * Realtime can subscribe AFTER the job already reached a terminal state, in which
 * case the initial select carries the truth and a late/stale realtime frame must
 * never regress the displayed status. We pick the row with the higher state rank;
 * ties (incl. both terminal) prefer the realtime row as the freshest payload.
 */
export function reconcileJob(a: JobRow | null, b: JobRow | null): JobRow {
  if (a && !b) return a
  if (b && !a) return b
  // both present
  const x = a as JobRow
  const y = b as JobRow
  return RANK[y.status] >= RANK[x.status] ? y : x
}

export function isThin(progress: JobProgress | null): boolean {
  return progress?.thin === true
}

export interface RenderRow {
  platform: Platform
  state: SignalState
}

/** One render row per requested platform; missing entries default to 'pending'. */
export function toRenderRows(
  progress: JobProgress | null,
  platforms: readonly Platform[],
): RenderRow[] {
  const map = progress?.platforms ?? {}
  return platforms.map((platform) => ({ platform, state: map[platform] ?? 'pending' }))
}
