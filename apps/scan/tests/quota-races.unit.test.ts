import { beforeEach, expect, it, vi } from 'vitest'
import { handleScanRetry } from '../src/scan-server'
import { handleVerifySubmission } from '../src/verify-server'
import { FakeFetcher } from '../src/fetchers'

vi.mock('../src/verify', () => ({ verifySubmission: vi.fn(async () => {}) }))
const { verifySubmission } = await import('../src/verify')
beforeEach(() => vi.mocked(verifySubmission).mockClear())

/**
 * The legacy read/write API deliberately lets parallel reads see the same
 * allowance. The atomic RPC boundary reserves synchronously. Real transaction
 * and lock behavior is exercised in tooling-tests/worker-quota-migration.test.mjs.
 */
function boundary(kind: 'scan' | 'verification', daily = 0, active = 0) {
  let spent = daily
  let live = active
  const job = { id: 'job-1', creator_id: 'owner', status: 'failed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const reserve = vi.fn((_name: string, _args: unknown) => ({ single: async () => {
    const reason = live >= (kind === 'scan' ? 1 : 3)
      ? (kind === 'scan' ? 'active_job_exists' : 'too_many_active_jobs')
      : spent >= (kind === 'scan' ? 3 : 20) ? 'daily_quota_exceeded' : null
    if (!reason) { spent++; live++ }
    return { data: { job_id: reason ? null : job.id, reason }, error: null }
  } }))
  const db = {
    rpc: reserve,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: async () => ({ data: Array.from({ length: active }, () => ({ ...job, status: 'fetching' })), error: null }),
        maybeSingle: async () => ({ data: table === 'mission_milestone_submissions'
          ? { id: 'sub', proof_urls: [], mission_participants: { creator_id: 'owner' } } : job, error: null }),
        single: async () => ({ data: { id: job.id }, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [{ id: job.id }], error: null }),
      }
      return { ...query, update: () => query, insert: () => query }
    },
  }
  // Compatibility fixture for the pre-fix handler only; production has no
  // process-local quota ledger after AUD-04/08.
  const ledger = { count: () => spent, record: () => { spent++ } }
  return { db, ledger, reserve, finish: () => { live = 0 }, spent: () => spent }
}

it('AUD-04: sequential retries of one failed scan consume the same three-launch ceiling', async () => {
  const state = boundary('scan')
  const run = vi.fn(async () => {})
  const deps = { db: state.db as never, userId: 'owner', run }
  const statuses: number[] = []
  for (let i = 0; i < 4; i++) {
    statuses.push((await handleScanRetry(deps, { jobId: 'job-1' })).status)
    state.finish()
  }
  expect(statuses).toEqual([202, 202, 202, 429])
  expect(run).toHaveBeenCalledTimes(3)
})

it.each([
  ['concurrency', 0, 2],
  ['daily', 19, 0],
] as const)('AUD-08: parallel distinct submissions share the last owner %s allowance', async (_name, daily, active) => {
  const state = boundary('verification', daily, active)
  const deps = { db: state.db as never, userId: 'owner', fetcher: new FakeFetcher(), ledger: state.ledger }
  const results = await Promise.all(['sub-1', 'sub-2'].map(submissionId => handleVerifySubmission(deps, { submissionId })))
  expect(results.map(r => r.status).sort()).toEqual([202, 429])
  expect(verifySubmission).toHaveBeenCalledTimes(1)
  expect(state.spent()).toBe(daily + 1)
})
