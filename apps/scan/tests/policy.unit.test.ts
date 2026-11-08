import { describe, it, expect } from 'vitest'
import {
  canRetry,
  isJobExpired,
  JOB_STALE_AFTER_MS,
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
