/** A minimal view of a creator_scan_jobs row needed for policy decisions. */
export interface JobRecord {
  id: string
  creator_id: string
  status: 'queued' | 'fetching' | 'analyzing' | 'ready' | 'failed'
  created_at: string
  updated_at: string
}

/**
 * Terminal statuses — a job in one of these is no longer active. Typed as
 * `string` because mission_verification_jobs shares the vocabulary minus
 * 'analyzing', and the staleness helpers below serve both tables.
 */
export const TERMINAL_STATUSES = new Set<string>(['ready', 'failed'])

/** The subset of a job row the staleness rules need. */
export interface JobLiveness {
  status: string
  updated_at: string
}

/**
 * How long a non-terminal job may go without a write before it is treated as
 * abandoned.
 *
 * Jobs run in-process as fire-and-forget background work with no durable queue,
 * so a container restart (Railway redeploy, OOM kill, crash) strands whatever
 * row the process was writing in 'queued'/'fetching'/'analyzing' forever —
 * nothing else ever transitions it. That single row then blocks every future
 * scan (`active_job_exists` → 429) and is not retryable (`status !== 'failed'`
 * → 409), locking the creator out until someone edits the row by hand.
 *
 * The cutoff has to sit safely above the worst-case runtime of one job, which
 * the per-attempt timeouts in http.ts now bound:
 *   Instagram  4×15s profile + 2 pages × 4×15s posts + backoff  ≈ 190s
 *   YouTube    4×10s channels + 4×10s playlistItems + backoff   ≈  90s
 *   Threads    4×15s profile + backoff                          ≈  65s
 *   LLM        2 attempts × 60s                                 ≈ 120s
 * ≈ 8 minutes for the slowest possible three-platform scan, and every phase
 * writes progress as it goes so `updated_at` advances throughout. 15 minutes
 * leaves ~2× headroom: a job silent for that long is dead, not slow.
 */
export const JOB_STALE_AFTER_MS = 15 * 60 * 1000

/**
 * True when a non-terminal job has gone silent long enough to be presumed dead.
 * Pure and `now`-parameterised so the rule is unit-testable without clock
 * mocking, and so callers sharing one decision use one timestamp.
 */
export function isJobExpired(job: JobLiveness, now: number): boolean {
  if (TERMINAL_STATUSES.has(job.status)) return false
  const updatedAt = Date.parse(job.updated_at)
  // A missing or unparseable timestamp must never expire a possibly-live job.
  if (!Number.isFinite(updatedAt)) return false
  return now - updatedAt > JOB_STALE_AFTER_MS
}

/** True when a job is non-terminal AND has not gone stale — i.e. really running. */
export function isJobActive(job: JobLiveness, now: number): boolean {
  return !TERMINAL_STATUSES.has(job.status) && !isJobExpired(job, now)
}

/**
 * Returns whether the verified user is allowed to retry a job.
 *
 * Rules:
 *   - The authenticated user must own the job.
 *   - The job must be in `failed` status, OR be a non-terminal job stranded by
 *     a restart. Without the second case the creator has no way back: the row
 *     never reaches 'failed' on its own, so retry would 409 forever.
 */
export function canRetry(
  job: (JobRecord & JobLiveness) | null | undefined,
  verifiedUserId: string,
  now: number = Date.now()
): { allowed: boolean; httpStatus: 404 | 409 | 200 } {
  if (!job) return { allowed: false, httpStatus: 404 }
  // Owner mismatch returns 404 (not 401): 401 is reserved for bad/missing tokens.
  // 404 avoids leaking job existence and prevents the web client from wrongly
  // prompting re-login when the user is authenticated but does not own the job.
  if (job.creator_id !== verifiedUserId) return { allowed: false, httpStatus: 404 }
  if (job.status !== 'failed' && !isJobExpired(job, now)) return { allowed: false, httpStatus: 409 }
  return { allowed: true, httpStatus: 200 }
}

// Launch concurrency and trailing-24h ceilings live exclusively in
// reserve_worker_launch (20261029090000). Job rows are liveness, not a launch
// ledger: retries reuse them. Do not reintroduce an application-side quota check.
