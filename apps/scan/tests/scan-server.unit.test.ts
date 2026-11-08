import { expect, it, vi } from 'vitest'
import { handleScan, handleScanRetry } from '../src/scan-server'

function setup(reason: string | null = null, error: unknown = null) {
  const rpc = vi.fn(() => ({ single: async () => ({ data: { job_id: reason ? null : 'job-1', reason }, error }) }))
  const run = vi.fn(async () => {})
  return { deps: { db: { rpc } as never, userId: 'owner', run }, rpc, run }
}

it('reserves initial scans and retries through the same owner budget before launching', async () => {
  const { deps, rpc, run } = setup()
  expect(await handleScan(deps)).toEqual({ status: 202, body: { jobId: 'job-1' } })
  expect(await handleScanRetry(deps, { jobId: 'job-1' })).toEqual({ status: 202, body: { jobId: 'job-1', retrying: true } })
  expect(rpc.mock.calls).toEqual([
    ['reserve_worker_launch', expect.objectContaining({ p_kind: 'scan', p_creator_id: 'owner', p_job_id: undefined })],
    ['reserve_worker_launch', expect.objectContaining({ p_kind: 'scan', p_creator_id: 'owner', p_job_id: 'job-1' })],
  ])
  expect(run).toHaveBeenCalledTimes(2)
})

it.each([
  ['job_not_found', 404], ['job_not_retryable', 409],
  ['active_job_exists', 429], ['daily_quota_exceeded', 429],
  ['no_social_handles', 400], ['creator_not_found', 404], ['unknown', 500],
])('does not launch a scan when the reservation returns %s', async (reason, status) => {
  const { deps, run } = setup(reason as string)
  expect((await handleScanRetry(deps, { jobId: 'job-1' })).status).toBe(status)
  expect(run).not.toHaveBeenCalled()
})

it('fails closed on reservation transport errors without logging details to the client', async () => {
  const { deps, run } = setup(null, { message: 'database details' })
  expect(await handleScan(deps)).toEqual({ status: 500, body: { error: 'internal error' } })
  expect(run).not.toHaveBeenCalled()
})
