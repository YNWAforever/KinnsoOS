import { describe, expect, it, vi } from 'vitest'
import { sweepExpiredJobs } from '../src/sweeper'
import { JOB_STALE_AFTER_MS } from '../src/policy'

// ---------------------------------------------------------------------------
// Stub DB factory — records the filters each table's sweep update was scoped to.
// ---------------------------------------------------------------------------

type Call = {
  table: string
  data: Record<string, unknown>
  statuses: string[]
  cutoff: string
}

function makeDb(opts: {
  rowsByTable?: Record<string, Array<{ id: string }>>
  errorsByTable?: Record<string, { message: string }>
} = {}) {
  const calls: Call[] = []

  const db = {
    _calls: calls,
    from: (table: string) => ({
      update: (data: Record<string, unknown>) => {
        const call: Call = { table, data, statuses: [], cutoff: '' }
        const builder = {
          in: (_col: string, values: string[]) => {
            call.statuses = values
            return builder
          },
          lt: (_col: string, value: string) => {
            call.cutoff = value
            return builder
          },
          select: async () => {
            calls.push(call)
            const error = opts.errorsByTable?.[table]
            if (error) return { data: null, error }
            return { data: opts.rowsByTable?.[table] ?? [], error: null }
          },
        }
        return builder
      },
    }),
  }
  return db
}

const NOW = Date.parse('2026-08-05T12:00:00.000Z')

// ---------------------------------------------------------------------------
// Tests
//
// Regression: a restart mid-job leaves rows in a non-terminal status that
// nothing ever advances. Without this sweep every restart adds another
// permanent zombie and the owner's UI shows a scan that spins forever.
// ---------------------------------------------------------------------------

describe('sweepExpiredJobs', () => {
  it('sweeps both job tables', async () => {
    const db = makeDb()
    await sweepExpiredJobs(db as never, NOW)
    expect(db._calls.map((c) => c.table)).toEqual([
      'creator_scan_jobs',
      'mission_verification_jobs',
    ])
  })

  it('targets only non-terminal statuses', async () => {
    const db = makeDb()
    await sweepExpiredJobs(db as never, NOW)
    const [scan, verify] = db._calls
    expect(scan.statuses).toEqual(['queued', 'fetching', 'analyzing'])
    // mission_verification_jobs has no 'analyzing' status.
    expect(verify.statuses).toEqual(['queued', 'fetching'])
    for (const call of db._calls) {
      expect(call.statuses).not.toContain('ready')
      expect(call.statuses).not.toContain('failed')
    }
  })

  it('only touches rows older than the staleness cutoff', async () => {
    const db = makeDb()
    await sweepExpiredJobs(db as never, NOW)
    const expected = new Date(NOW - JOB_STALE_AFTER_MS).toISOString()
    for (const call of db._calls) expect(call.cutoff).toBe(expected)
  })

  it('retires swept rows to failed with a retryable, generic reason', async () => {
    const db = makeDb()
    await sweepExpiredJobs(db as never, NOW)
    for (const call of db._calls) {
      expect(call.data.status).toBe('failed')
      expect(call.data.completed_at).toBe(new Date(NOW).toISOString())
      expect(String(call.data.error)).toMatch(/interrupted/i)
      // No DB internals leak into this owner-readable column.
      expect(String(call.data.error)).not.toMatch(/constraint|relation|column/i)
    }
  })

  it('returns the total number of rows retired across both tables', async () => {
    const db = makeDb({
      rowsByTable: {
        creator_scan_jobs: [{ id: 'a' }, { id: 'b' }],
        mission_verification_jobs: [{ id: 'c' }],
      },
    })
    expect(await sweepExpiredJobs(db as never, NOW)).toBe(3)
  })

  it('still sweeps the second table when the first errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeDb({
      errorsByTable: { creator_scan_jobs: { message: 'boom' } },
      rowsByTable: { mission_verification_jobs: [{ id: 'c' }] },
    })
    expect(await sweepExpiredJobs(db as never, NOW)).toBe(1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
