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
 * Returns whether a new scan should be rate-limited.
 *
 * Rules (per spec §7):
 *   - Block if any job is non-terminal (queued|fetching|analyzing) AND still
 *     live; a job stranded by a restart (see JOB_STALE_AFTER_MS) does not count.
 *   - Block if ≥ 3 jobs were created in the trailing 24h.
 *
 * @param jobs - ALL jobs for this creator, ordered newest-first (at most the last 24h + any active).
 * @param now  - Injected clock, so the staleness window is deterministic in tests.
 */
export function rateLimitDecision(
  jobs: JobRecord[],
  now: number = Date.now()
): { limited: boolean; reason?: string } {
  const hasActive = jobs.some((j) => isJobActive(j, now))
  if (hasActive) return { limited: true, reason: 'active_job_exists' }

  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const recentCount = jobs.filter((j) => j.created_at >= since).length
  if (recentCount >= 3) return { limited: true, reason: 'daily_quota_exceeded' }

  return { limited: false }
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

// ---------------------------------------------------------------------------
// Mission verification limits
// ---------------------------------------------------------------------------

/**
 * Concurrency cap on live verification jobs per creator. Each run costs up to
 * two upstream calls (RapidAPI/YouTube) × four attempts, so concurrency is a
 * direct multiplier on paid-API spend and on this single worker's memory.
 * Three is comfortably above the realistic case (a creator submitting proof for
 * a handful of milestones at once) and far below anything that hurts.
 */
export const MAX_ACTIVE_VERIFICATIONS = 3

/** Trailing-24h ceiling on verification RUNS per creator. */
export const MAX_VERIFICATIONS_PER_DAY = 20

/**
 * Returns whether a verification run should be rate-limited.
 *
 * Mirrors `rateLimitDecision`, with one deliberate difference: verification
 * allows limited concurrency (a creator legitimately has several submissions in
 * flight) where a scan allows none.
 *
 * @param activeCount - Live (non-terminal, non-stale) verification jobs owned by this creator.
 * @param dayCount    - Verification runs LAUNCHED for this creator in the trailing 24h.
 */
export function verificationRateLimitDecision(
  activeCount: number,
  dayCount: number
): { limited: boolean; reason?: string } {
  if (activeCount >= MAX_ACTIVE_VERIFICATIONS) {
    return { limited: true, reason: 'too_many_active_jobs' }
  }
  if (dayCount >= MAX_VERIFICATIONS_PER_DAY) {
    return { limited: true, reason: 'daily_quota_exceeded' }
  }
  return { limited: false }
}

/**
 * Sliding-window count of verification runs actually launched by THIS process.
 *
 * The daily cap cannot be derived from `mission_verification_jobs` alone: a
 * retry RESETS the existing row rather than inserting one, so a creator with a
 * single submission can hold the row count at 1 while spending an unbounded
 * number of upstream calls. Counting launches instead of rows is precisely what
 * makes the cap bite on the retry path — the hole this class exists to close.
 *
 * Deliberately in-process: a durable counter would need a schema change, and a
 * restart that clears this map also kills the runs it was bounding. It is a
 * spend ceiling, not an audit trail — the DB-derived concurrency check is the
 * part that survives a restart.
 */
export class RunLedger {
  private readonly runs = new Map<string, number[]>()

  constructor(
    private readonly windowMs: number = 24 * 60 * 60 * 1000,
    /** Hard bound on tracked keys so the map cannot grow without limit. */
    private readonly maxKeys: number = 10_000
  ) {}

  /** Records one launched run for `key` (a creator id). */
  record(key: string, now: number = Date.now()): void {
    const kept = this.within(key, now)
    kept.push(now)
    this.runs.set(key, kept)
    // Keys come from verified bearer tokens, so they cannot be minted at will —
    // but evict the oldest entry anyway rather than trust that forever.
    if (this.runs.size > this.maxKeys) {
      const oldest = this.runs.keys().next()
      if (!oldest.done) this.runs.delete(oldest.value)
    }
  }

  /** Runs recorded for `key` inside the trailing window. */
  count(key: string, now: number = Date.now()): number {
    const kept = this.within(key, now)
    if (kept.length === 0) this.runs.delete(key)
    else this.runs.set(key, kept)
    return kept.length
  }

  private within(key: string, now: number): number[] {
    const cutoff = now - this.windowMs
    return (this.runs.get(key) ?? []).filter((t) => t > cutoff)
  }
}
