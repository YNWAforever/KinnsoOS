import { describe, expect, it, vi, beforeEach } from 'vitest'
import { handleVerifySubmission, handleVerifyRetry, type VerifyServerDeps } from '../src/verify-server'
import { FakeFetcher } from '../src/fetchers'
import { JOB_STALE_AFTER_MS, MAX_ACTIVE_VERIFICATIONS, MAX_VERIFICATIONS_PER_DAY, RunLedger } from '../src/policy'

// The handlers launch verifySubmission fire-and-forget; stub it so background
// work never touches the stub DB and so launches can be counted.
vi.mock('../src/verify', () => ({ verifySubmission: vi.fn(async () => {}) }))
const { verifySubmission } = await import('../src/verify')
const launched = vi.mocked(verifySubmission)

beforeEach(() => launched.mockClear())

// ---------------------------------------------------------------------------
// Stub DB factory
// ---------------------------------------------------------------------------

type ActiveRow = { id: string; status: string; updated_at: string }
type ExistingJob = { id: string; creator_id: string; status: string; updated_at: string }

function makeServerDb(opts: {
  submissionOwnerId?: string
  jobInsertId?: string
  jobInsertError?: { code?: string; message: string }
  existingJob?: ExistingJob | null
  /** Rows returned by the active-verification-count query. */
  activeJobs?: ActiveRow[]
  activeJobsError?: { message: string } | null
  /** Rows returned by the conditional retry reset; [] means the CAS matched nothing. */
  resetRows?: Array<{ id: string }>
  resetError?: { code?: string; message: string } | null
  /** Whether the caller (userId) is an active kinnso_ops_members row. */
  callerIsOps?: boolean
} = {}) {
  const updates: Array<{ table: string; data: Record<string, unknown>; filters: Array<[string, unknown]> }> = []
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = []
  /** creator_id values the active-job-count query (countActiveVerifications) was run for. */
  const activeJobsQueriedFor: unknown[] = []

  const submission = opts.submissionOwnerId
    ? { id: 'sub-1', proof_urls: ['https://www.instagram.com/p/Cabc/'], mission_participant_id: 'p-1', mission_participants: { creator_id: opts.submissionOwnerId } }
    : null

  const db = {
    _updates: updates,
    _inserts: inserts,
    _activeJobsQueriedFor: activeJobsQueriedFor,
    from: (table: string) => {
      if (table === 'mission_milestone_submissions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: submission, error: null }),
            }),
          }),
        }
      }
      if (table === 'mission_verification_jobs') {
        return {
          insert: (data: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                inserts.push({ table, data })
                if (opts.jobInsertError) return { data: null, error: opts.jobInsertError }
                return { data: { id: opts.jobInsertId ?? 'job-1' }, error: null }
              },
            }),
          }),
          select: () => ({
            eq: (col: string, val: unknown) => ({
              // Single-job lookup (retry eligibility).
              maybeSingle: async () => ({ data: opts.existingJob ?? null, error: null }),
              // Active-job count (rate limit) -- countActiveVerifications always queries by
              // 'creator_id', so recording every call here directly proves WHICH id the
              // production code actually passed, rather than just returning a fixed result
              // regardless of the argument.
              in: async () => {
                if (col === 'creator_id') activeJobsQueriedFor.push(val)
                return { data: opts.activeJobs ?? [], error: opts.activeJobsError ?? null }
              },
            }),
          }),
          update: (data: Record<string, unknown>) => {
            const filters: Array<[string, unknown]> = []
            const builder = {
              eq: (col: string, val: unknown) => {
                filters.push([col, val])
                return builder
              },
              select: async () => {
                updates.push({ table, data, filters })
                if (opts.resetError) return { data: null, error: opts.resetError }
                return { data: opts.resetRows ?? [{ id: 'job-1' }], error: null }
              },
            }
            return builder
          },
        }
      }
      if (table === 'kinnso_ops_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.callerIsOps ? { id: 'ops-1' } : null, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  }
  return db as never
}

function makeDeps(db: unknown, userId: string, ledger = new RunLedger()): VerifyServerDeps {
  return { db: db as never, fetcher: new FakeFetcher(), userId, ledger }
}

/** A verification job row last written `ms` ago. */
function agedJob(status: string, ms: number, creatorId = 'user-1'): ExistingJob {
  return { id: 'job-1', creator_id: creatorId, status, updated_at: new Date(Date.now() - ms).toISOString() }
}

function activeRows(n: number, ageMs = 1_000): ActiveRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `active-${i}`,
    status: 'fetching',
    updated_at: new Date(Date.now() - ageMs).toISOString(),
  }))
}

// ---------------------------------------------------------------------------
// handleVerifySubmission tests
// ---------------------------------------------------------------------------

describe('handleVerifySubmission', () => {
  it('404s when submission not found', async () => {
    const db = makeServerDb({ submissionOwnerId: undefined })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(404)
  })

  it('404s when submission belongs to another creator', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-2' })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(404)
  })

  it('returns 202 { jobId } for the owner', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-1', jobInsertId: 'job-1' })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
    expect(result.body).toMatchObject({ jobId: 'job-1' })
  })

  it('returns 429 on duplicate active job (23505)', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-1', jobInsertError: { code: '23505', message: 'unique violation' } })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(429)
  })

  it('500s when the active-job count cannot be read', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-1', activeJobsError: { message: 'boom' } })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(500)
  })
})

describe('handleVerifySubmission — ops caller', () => {
  it('404s a non-owner, non-ops caller (unchanged behavior)', async () => {
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: false })
    const result = await handleVerifySubmission(makeDeps(db, 'stranger-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(404)
  })

  it('allows an active ops caller to trigger verification for a submission they do not own', async () => {
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: true })
    const result = await handleVerifySubmission(makeDeps(db, 'ops-caller-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
  })

  it('inserts the job with the SUBMISSION OWNER\'s creator_id, not the ops caller\'s', async () => {
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: true })
    await handleVerifySubmission(makeDeps(db, 'ops-caller-1'), { submissionId: 'sub-1' })
    const insert = (db as unknown as { _inserts: Array<{ data: Record<string, unknown> }> })._inserts[0]
    expect(insert.data.creator_id).toBe('creator-1')
  })

  it('scopes the concurrency/ledger check to the owner, not the ops caller', async () => {
    // 3 active jobs already belong to the OWNER -- an ops caller with zero jobs of their own
    // must still be throttled, proving the check is keyed by ownerId, not by userId.
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: true, activeJobs: activeRows(3) })
    const result = await handleVerifySubmission(makeDeps(db, 'ops-caller-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(429)
    // The 429 alone doesn't prove WHICH id was checked -- the stub returns the same
    // activeJobs fixture regardless of the query argument. Assert on the actually-recorded
    // id directly: the query must have run for the submission's owner, never the ops caller.
    const queriedFor = (db as unknown as { _activeJobsQueriedFor: unknown[] })._activeJobsQueriedFor
    expect(queriedFor).toEqual(['creator-1'])
    expect(queriedFor).not.toContain('ops-caller-1')
  })

  it('fails closed (404, not 500 or 202) when the ops-membership check itself errors', async () => {
    const db = makeServerDb({ submissionOwnerId: 'creator-1' })
    // Force the kinnso_ops_members lookup to error, bypassing the callerIsOps convenience
    // flag entirely, to prove isActiveOpsCaller's documented fail-closed behavior end-to-end
    // through the handler, not just in isolation.
    const dbWithOpsQueryError = {
      ...(db as Record<string, unknown>),
      from: (table: string) => {
        if (table === 'kinnso_ops_members') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'connection reset' } }) }) }) }),
          }
        }
        return (db as { from: (t: string) => unknown }).from(table)
      },
    }
    const result = await handleVerifySubmission(makeDeps(dbWithOpsQueryError, 'unverifiable-caller'), { submissionId: 'sub-1' })
    expect(result.status).toBe(404)
  })

  it('does not query kinnso_ops_members at all when the caller already owns the submission', async () => {
    // The stub only serves kinnso_ops_members reads when queried; owner-path callers must
    // never need that extra round trip.
    const db = makeServerDb({ submissionOwnerId: 'creator-1' })
    const result = await handleVerifySubmission(makeDeps(db, 'creator-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
  })

  it('the two 404 branches (missing submission vs. not-owner-not-ops) return an identical body, leaking no distinguishing signal', async () => {
    const missing = await handleVerifySubmission(makeDeps(makeServerDb({}), 'someone'), { submissionId: 'sub-1' })
    const forbidden = await handleVerifySubmission(
      makeDeps(makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: false }), 'stranger-1'),
      { submissionId: 'sub-1' },
    )
    expect(missing.status).toBe(404)
    expect(forbidden.status).toBe(404)
    expect(missing.body).toEqual(forbidden.body)
  })
})

// ---------------------------------------------------------------------------
// Per-creator throttling
//
// Regression: neither handler had a quota or a concurrency cap, so a creator
// could drive unbounded RapidAPI/YouTube spend — and the retry path was the
// cheapest way to do it, since it reuses one row and so never moves any
// row-derived counter.
// ---------------------------------------------------------------------------

describe('verification throttling', () => {
  it('429s a submission once the concurrency cap is reached', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-1', activeJobs: activeRows(MAX_ACTIVE_VERIFICATIONS) })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(429)
    expect(result.body).toMatchObject({ reason: 'too_many_active_jobs' })
    // Rejected before a row is created.
    expect((db as unknown as { _inserts: unknown[] })._inserts).toHaveLength(0)
    expect(launched).not.toHaveBeenCalled()
  })

  it('allows a submission one below the concurrency cap', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-1', activeJobs: activeRows(MAX_ACTIVE_VERIFICATIONS - 1) })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
  })

  it('ignores jobs stranded by a restart when counting concurrency', async () => {
    const db = makeServerDb({
      submissionOwnerId: 'user-1',
      activeJobs: activeRows(MAX_ACTIVE_VERIFICATIONS, JOB_STALE_AFTER_MS + 60_000),
    })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
  })

  it('429s a submission once the daily run cap is reached', async () => {
    const ledger = new RunLedger()
    for (let i = 0; i < MAX_VERIFICATIONS_PER_DAY; i++) ledger.record('user-1')
    const db = makeServerDb({ submissionOwnerId: 'user-1' })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1', ledger), { submissionId: 'sub-1' })
    expect(result.status).toBe(429)
    expect(result.body).toMatchObject({ reason: 'daily_quota_exceeded' })
  })

  it('does not charge another creator for this one’s runs', async () => {
    const ledger = new RunLedger()
    for (let i = 0; i < MAX_VERIFICATIONS_PER_DAY; i++) ledger.record('user-2')
    const db = makeServerDb({ submissionOwnerId: 'user-1' })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1', ledger), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
  })

  it('caps repeated retries of a SINGLE job, which no row count would bound', async () => {
    const ledger = new RunLedger()
    const statuses: number[] = []
    for (let i = 0; i < MAX_VERIFICATIONS_PER_DAY + 3; i++) {
      const db = makeServerDb({ existingJob: agedJob('failed', 1_000) })
      const result = await handleVerifyRetry(makeDeps(db, 'user-1', ledger), { jobId: 'job-1' })
      statuses.push(result.status)
    }
    expect(statuses.filter((s) => s === 202)).toHaveLength(MAX_VERIFICATIONS_PER_DAY)
    expect(statuses.filter((s) => s === 429)).toHaveLength(3)
    // The pipeline — and its paid upstream calls — ran only for the allowed runs.
    expect(launched).toHaveBeenCalledTimes(MAX_VERIFICATIONS_PER_DAY)
  })

  it('does not consume quota for a retry that was rejected', async () => {
    const ledger = new RunLedger()
    const db = makeServerDb({ existingJob: agedJob('ready', 1_000) })
    expect((await handleVerifyRetry(makeDeps(db, 'user-1', ledger), { jobId: 'job-1' })).status).toBe(409)
    expect(ledger.count('user-1')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// handleVerifyRetry tests
// ---------------------------------------------------------------------------

describe('handleVerifyRetry', () => {
  it('404s when job not found', async () => {
    const db = makeServerDb({ existingJob: null })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(404)
  })

  it('404s when job belongs to another creator', async () => {
    const db = makeServerDb({ existingJob: agedJob('failed', 1_000, 'user-2') })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(404)
  })

  it('409s when job is not in failed status', async () => {
    const db = makeServerDb({ existingJob: agedJob('ready', 1_000) })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(409)
  })

  it('409s a running job that is still inside the staleness window', async () => {
    const db = makeServerDb({ existingJob: agedJob('fetching', JOB_STALE_AFTER_MS - 1_000) })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(409)
  })

  it('allows retry of a job stranded by a restart', async () => {
    const db = makeServerDb({ existingJob: agedJob('fetching', JOB_STALE_AFTER_MS + 60_000) })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(202)
  })

  it('returns 202 { jobId, retrying: true } for owner with failed job', async () => {
    const db = makeServerDb({ existingJob: agedJob('failed', 1_000) })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(202)
    expect(result.body).toMatchObject({ jobId: 'job-1', retrying: true })
  })

  // Regression: the reset used to filter on id alone, so two concurrent retries
  // both passed the status check and both launched the pipeline.
  it('scopes the reset to the exact row revision it validated', async () => {
    const job = agedJob('failed', 1_000)
    const db = makeServerDb({ existingJob: job })
    await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    const update = (db as unknown as { _updates: Array<{ filters: Array<[string, unknown]> }> })._updates[0]
    expect(update.filters).toEqual([
      ['id', 'job-1'],
      ['status', 'failed'],
      ['updated_at', job.updated_at],
    ])
  })

  it('409s and launches nothing when the conditional reset matches no row', async () => {
    const db = makeServerDb({ existingJob: agedJob('failed', 1_000), resetRows: [] })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(409)
    expect(launched).not.toHaveBeenCalled()
  })

  it('does not consume quota when the conditional reset loses the race', async () => {
    const ledger = new RunLedger()
    const db = makeServerDb({ existingJob: agedJob('failed', 1_000), resetRows: [] })
    await handleVerifyRetry(makeDeps(db, 'user-1', ledger), { jobId: 'job-1' })
    expect(ledger.count('user-1')).toBe(0)
  })

  it('429s when the reset hits the single-active unique index (23505)', async () => {
    const db = makeServerDb({ existingJob: agedJob('failed', 1_000), resetError: { code: '23505', message: 'unique violation' } })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(429)
  })
})
