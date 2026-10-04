import { describe, it, expect } from 'vitest'
import {
  rateLimitDecision,
  canRetry,
  isJobExpired,
  verificationRateLimitDecision,
  RunLedger,
  JOB_STALE_AFTER_MS,
  MAX_ACTIVE_VERIFICATIONS,
  MAX_VERIFICATIONS_PER_DAY,
  type JobRecord,
} from '../src/policy'

const NOW = Date.parse('2026-08-05T12:00:00.000Z')

const BASE_JOB: JobRecord = {
  id: 'job-1',
  creator_id: 'creator-1',
  status: 'ready',
  created_at: new Date(Date.now() - 60_000).toISOString(), // 1 minute ago
  updated_at: new Date(Date.now() - 60_000).toISOString(),
}

/** A job last written `ms` before NOW. */
function agedJob(status: JobRecord['status'], ms: number): JobRecord {
  return {
    ...BASE_JOB,
    status,
    created_at: new Date(NOW - ms).toISOString(),
    updated_at: new Date(NOW - ms).toISOString(),
  }
}

describe('rateLimitDecision', () => {
  it('returns not limited for an empty job list', () => {
    expect(rateLimitDecision([])).toEqual({ limited: false })
  })

  it('blocks when an active (queued) job exists', () => {
    const jobs: JobRecord[] = [{ ...BASE_JOB, status: 'queued' }]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'active_job_exists' })
  })

  it('blocks when a fetching job exists', () => {
    const jobs: JobRecord[] = [{ ...BASE_JOB, status: 'fetching' }]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'active_job_exists' })
  })

  it('blocks when an analyzing job exists', () => {
    const jobs: JobRecord[] = [{ ...BASE_JOB, status: 'analyzing' }]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'active_job_exists' })
  })

  it('does not block for exactly 2 recent completed jobs', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const jobs: JobRecord[] = [
      { ...BASE_JOB, id: 'j1', status: 'ready', created_at: recent },
      { ...BASE_JOB, id: 'j2', status: 'failed', created_at: recent },
    ]
    expect(rateLimitDecision(jobs)).toEqual({ limited: false })
  })

  it('blocks when 3 completed jobs exist in trailing 24h', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const jobs: JobRecord[] = [
      { ...BASE_JOB, id: 'j1', status: 'ready', created_at: recent },
      { ...BASE_JOB, id: 'j2', status: 'failed', created_at: recent },
      { ...BASE_JOB, id: 'j3', status: 'ready', created_at: recent },
    ]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'daily_quota_exceeded' })
  })

  it('does not count jobs older than 24h toward quota', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const recent = new Date(Date.now() - 60_000).toISOString()
    const jobs: JobRecord[] = [
      { ...BASE_JOB, id: 'j1', status: 'ready', created_at: old },
      { ...BASE_JOB, id: 'j2', status: 'ready', created_at: old },
      { ...BASE_JOB, id: 'j3', status: 'ready', created_at: recent }, // only 1 recent
    ]
    expect(rateLimitDecision(jobs)).toEqual({ limited: false })
  })
})

describe('canRetry', () => {
  it('returns 404 for missing job', () => {
    expect(canRetry(null, 'any-user')).toEqual({ allowed: false, httpStatus: 404 })
  })

  it('returns 404 when creator_id does not match', () => {
    expect(canRetry({ ...BASE_JOB, status: 'failed' }, 'other-user')).toEqual({
      allowed: false,
      httpStatus: 404,
    })
  })

  it('returns 409 when job is not failed (status=ready)', () => {
    expect(canRetry({ ...BASE_JOB, status: 'ready' }, 'creator-1')).toEqual({
      allowed: false,
      httpStatus: 409,
    })
  })

  it('returns 409 when job is still running (status=fetching)', () => {
    expect(canRetry({ ...BASE_JOB, status: 'fetching' }, 'creator-1')).toEqual({
      allowed: false,
      httpStatus: 409,
    })
  })

  it('allows retry for own failed job', () => {
    expect(canRetry({ ...BASE_JOB, status: 'failed' }, 'creator-1')).toEqual({
      allowed: true,
      httpStatus: 200,
    })
  })
})

// ---------------------------------------------------------------------------
// Restart-stranded jobs
//
// Regression: jobs run in-process with no durable queue, so a container restart
// leaves a row in 'fetching'/'analyzing' that nothing ever advances. Before the
// staleness rule that row blocked every new scan (429) AND was not retryable
// (409) — a permanent lockout only a manual DB edit could clear.
// ---------------------------------------------------------------------------

describe('isJobExpired', () => {
  it('never expires a terminal job, however old', () => {
    expect(isJobExpired(agedJob('ready', 10 * JOB_STALE_AFTER_MS), NOW)).toBe(false)
    expect(isJobExpired(agedJob('failed', 10 * JOB_STALE_AFTER_MS), NOW)).toBe(false)
  })

  it('does not expire a non-terminal job still inside the window', () => {
    expect(isJobExpired(agedJob('fetching', JOB_STALE_AFTER_MS - 1_000), NOW)).toBe(false)
  })

  it('expires a non-terminal job that has gone silent past the window', () => {
    expect(isJobExpired(agedJob('fetching', JOB_STALE_AFTER_MS + 1_000), NOW)).toBe(true)
  })

  it('treats an unparseable updated_at as live rather than expiring it', () => {
    expect(isJobExpired({ status: 'analyzing', updated_at: 'not-a-date' }, NOW)).toBe(false)
  })
})

describe('rateLimitDecision — stranded jobs', () => {
  it('still blocks on a non-terminal job inside the staleness window', () => {
    const jobs = [agedJob('analyzing', JOB_STALE_AFTER_MS - 1_000)]
    expect(rateLimitDecision(jobs, NOW)).toMatchObject({
      limited: true,
      reason: 'active_job_exists',
    })
  })

  it('does not block on a non-terminal job stranded by a restart', () => {
    const jobs = [agedJob('fetching', JOB_STALE_AFTER_MS + 60_000)]
    expect(rateLimitDecision(jobs, NOW)).toEqual({ limited: false })
  })

  it('still counts a stranded job toward the 24h quota', () => {
    const jobs = [
      agedJob('fetching', JOB_STALE_AFTER_MS + 60_000),
      agedJob('ready', 60_000),
      agedJob('failed', 60_000),
    ]
    expect(rateLimitDecision(jobs, NOW)).toMatchObject({
      limited: true,
      reason: 'daily_quota_exceeded',
    })
  })
})

describe('canRetry — stranded jobs', () => {
  it('still 409s a non-terminal job inside the staleness window', () => {
    expect(canRetry(agedJob('fetching', JOB_STALE_AFTER_MS - 1_000), 'creator-1', NOW)).toEqual({
      allowed: false,
      httpStatus: 409,
    })
  })

  it('allows retry of a non-terminal job stranded by a restart', () => {
    expect(canRetry(agedJob('fetching', JOB_STALE_AFTER_MS + 60_000), 'creator-1', NOW)).toEqual({
      allowed: true,
      httpStatus: 200,
    })
  })

  it('still 404s a stranded job owned by someone else', () => {
    expect(canRetry(agedJob('fetching', JOB_STALE_AFTER_MS + 60_000), 'other-user', NOW)).toEqual({
      allowed: false,
      httpStatus: 404,
    })
  })
})

// ---------------------------------------------------------------------------
// Mission verification limits
//
// Regression: verification had NO per-creator quota or concurrency cap on
// either the submit or the retry path, so one submission could be retried
// indefinitely to drive unbounded RapidAPI/YouTube spend.
// ---------------------------------------------------------------------------

describe('verificationRateLimitDecision', () => {
  it('allows a run when nothing is active and the day is empty', () => {
    expect(verificationRateLimitDecision(0, 0)).toEqual({ limited: false })
  })

  it('allows concurrency up to one below the cap', () => {
    expect(verificationRateLimitDecision(MAX_ACTIVE_VERIFICATIONS - 1, 0)).toEqual({
      limited: false,
    })
  })

  it('blocks at the concurrency cap', () => {
    expect(verificationRateLimitDecision(MAX_ACTIVE_VERIFICATIONS, 0)).toMatchObject({
      limited: true,
      reason: 'too_many_active_jobs',
    })
  })

  it('allows a run one below the daily cap', () => {
    expect(verificationRateLimitDecision(0, MAX_VERIFICATIONS_PER_DAY - 1)).toEqual({
      limited: false,
    })
  })

  it('blocks at the daily cap even with nothing active', () => {
    expect(verificationRateLimitDecision(0, MAX_VERIFICATIONS_PER_DAY)).toMatchObject({
      limited: true,
      reason: 'daily_quota_exceeded',
    })
  })

  it('reports the concurrency reason when both caps are exceeded', () => {
    expect(
      verificationRateLimitDecision(MAX_ACTIVE_VERIFICATIONS, MAX_VERIFICATIONS_PER_DAY),
    ).toMatchObject({ limited: true, reason: 'too_many_active_jobs' })
  })
})

describe('RunLedger', () => {
  it('counts zero for an unseen key', () => {
    expect(new RunLedger().count('creator-1', NOW)).toBe(0)
  })

  it('counts runs recorded inside the window', () => {
    const ledger = new RunLedger()
    ledger.record('creator-1', NOW - 1_000)
    ledger.record('creator-1', NOW - 500)
    expect(ledger.count('creator-1', NOW)).toBe(2)
  })

  it('keeps creators separate', () => {
    const ledger = new RunLedger()
    ledger.record('creator-1', NOW)
    expect(ledger.count('creator-2', NOW)).toBe(0)
  })

  it('drops runs that fall out of the trailing window', () => {
    const windowMs = 60_000
    const ledger = new RunLedger(windowMs)
    ledger.record('creator-1', NOW - windowMs - 1)
    ledger.record('creator-1', NOW - 1_000)
    expect(ledger.count('creator-1', NOW)).toBe(1)
  })

  it('counts repeated retries of a single job — the row count never would', () => {
    const ledger = new RunLedger()
    for (let i = 0; i < MAX_VERIFICATIONS_PER_DAY; i++) ledger.record('creator-1', NOW)
    expect(verificationRateLimitDecision(0, ledger.count('creator-1', NOW))).toMatchObject({
      limited: true,
      reason: 'daily_quota_exceeded',
    })
  })

  it('evicts old keys once maxKeys is exceeded', () => {
    const ledger = new RunLedger(24 * 60 * 60 * 1000, 2)
    ledger.record('a', NOW)
    ledger.record('b', NOW)
    ledger.record('c', NOW)
    expect(ledger.count('a', NOW)).toBe(0)
    expect(ledger.count('c', NOW)).toBe(1)
  })
})
