import { describe, expect, it, vi } from 'vitest'
import { handleScanRetry, type ScanRetryDeps } from '../src/scan-server'
import { JOB_STALE_AFTER_MS } from '../src/policy'

// ---------------------------------------------------------------------------
// Stub DB factory
// ---------------------------------------------------------------------------

type JobRow = { id: string; creator_id: string; status: string; created_at: string; updated_at: string }

function makeDb(opts: {
  job?: JobRow | null
  jobError?: { message: string } | null
  /** Rows returned by the conditional reset; [] means the CAS matched nothing. */
  resetRows?: Array<{ id: string }>
  resetError?: { code?: string; message: string } | null
} = {}) {
  const updates: Array<{ data: Record<string, unknown>; filters: Array<[string, unknown]> }> = []

  const db = {
    _updates: updates,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opts.job ?? null, error: opts.jobError ?? null }),
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
            updates.push({ data, filters })
            if (opts.resetError) return { data: null, error: opts.resetError }
            return { data: opts.resetRows ?? [{ id: 'job-1' }], error: null }
          },
        }
        return builder
      },
    }),
  }
  return db
}

function makeDeps(db: ReturnType<typeof makeDb>, userId: string, run = vi.fn(async () => {})): ScanRetryDeps & { run: typeof run } {
  return { db: db as never, userId, run }
}

/** A scan job row last written `ms` ago. */
function agedJob(status: string, ms: number, creatorId = 'user-1'): JobRow {
  const at = new Date(Date.now() - ms).toISOString()
  return { id: 'job-1', creator_id: creatorId, status, created_at: at, updated_at: at }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleScanRetry', () => {
  it('404s when the job does not exist', async () => {
    const deps = makeDeps(makeDb({ job: null }), 'user-1')
    expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(404)
    expect(deps.run).not.toHaveBeenCalled()
  })

  it('404s when the job belongs to another creator', async () => {
    const deps = makeDeps(makeDb({ job: agedJob('failed', 1_000, 'user-2') }), 'user-1')
    expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(404)
  })

  it('409s when the job is not failed', async () => {
    const deps = makeDeps(makeDb({ job: agedJob('ready', 1_000) }), 'user-1')
    expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(409)
  })

  it('500s when the job lookup fails', async () => {
    const deps = makeDeps(makeDb({ jobError: { message: 'boom' } }), 'user-1')
    expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(500)
  })

  it('202s and launches the pipeline for an owned failed job', async () => {
    const deps = makeDeps(makeDb({ job: agedJob('failed', 1_000) }), 'user-1')
    const result = await handleScanRetry(deps, { jobId: 'job-1' })
    expect(result.status).toBe(202)
    expect(result.body).toMatchObject({ jobId: 'job-1', retrying: true })
    expect(deps.run).toHaveBeenCalledTimes(1)
  })

  it('allows retry of a job stranded by a restart', async () => {
    const deps = makeDeps(makeDb({ job: agedJob('fetching', JOB_STALE_AFTER_MS + 60_000) }), 'user-1')
    expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(202)
  })

  it('409s a running job still inside the staleness window', async () => {
    const deps = makeDeps(makeDb({ job: agedJob('fetching', JOB_STALE_AFTER_MS - 1_000) }), 'user-1')
    expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(409)
  })

  it('maps a 23505 on reset to 429', async () => {
    const deps = makeDeps(
      makeDb({ job: agedJob('failed', 1_000), resetError: { code: '23505', message: 'unique violation' } }),
      'user-1',
    )
    const result = await handleScanRetry(deps, { jobId: 'job-1' })
    expect(result.status).toBe(429)
    expect(result.body).toMatchObject({ reason: 'active_job_exists' })
  })

  it('500s on any other reset error', async () => {
    const deps = makeDeps(
      makeDb({ job: agedJob('failed', 1_000), resetError: { message: 'connection reset' } }),
      'user-1',
    )
    expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(500)
  })

  // Regression: the reset used to filter on id alone, so two concurrent retries
  // both passed the canRetry check and both launched the pipeline — double paid
  // API spend and interleaved status writes on one job.
  it('scopes the reset to the exact row revision it validated', async () => {
    const job = agedJob('failed', 1_000)
    const db = makeDb({ job })
    await handleScanRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(db._updates[0].filters).toEqual([
      ['id', 'job-1'],
      ['status', 'failed'],
      ['updated_at', job.updated_at],
    ])
  })

  it('409s and launches nothing when the conditional reset matches no row', async () => {
    const deps = makeDeps(makeDb({ job: agedJob('failed', 1_000), resetRows: [] }), 'user-1')
    const result = await handleScanRetry(deps, { jobId: 'job-1' })
    expect(result.status).toBe(409)
    expect(deps.run).not.toHaveBeenCalled()
  })

  it('launches the pipeline exactly once across two concurrent retries', async () => {
    const job = agedJob('failed', 1_000)
    const run = vi.fn(async () => {})
    // Model the DB: whichever reset lands first flips the row, so the second
    // finds no row matching the revision it read.
    let claimed = false
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: job, error: null }) }) }),
        update: () => {
          const builder = {
            eq: () => builder,
            select: async () => {
              if (claimed) return { data: [], error: null }
              claimed = true
              return { data: [{ id: job.id }], error: null }
            },
          }
          return builder
        },
      }),
    }
    const deps: ScanRetryDeps = { db: db as never, userId: 'user-1', run }

    const results = await Promise.all([
      handleScanRetry(deps, { jobId: 'job-1' }),
      handleScanRetry(deps, { jobId: 'job-1' }),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([202, 409])
    expect(run).toHaveBeenCalledTimes(1)
  })
})
