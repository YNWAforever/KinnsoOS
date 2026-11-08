import { beforeEach, expect, it, vi } from 'vitest'
import { handleVerifySubmission, handleVerifyRetry } from '../src/verify-server'
import { FakeFetcher } from '../src/fetchers'

vi.mock('../src/verify', () => ({ verifySubmission: vi.fn(async () => {}) }))
const { verifySubmission } = await import('../src/verify')
beforeEach(() => vi.mocked(verifySubmission).mockClear())

function setup(opts: { owner?: string | null; ops?: boolean; opsError?: boolean; lookupError?: boolean; reason?: string; rpcError?: boolean; response?: unknown } = {}) {
  const rpc = vi.fn(() => ({ single: async () => ({
    data: opts.response === undefined ? { job_id: opts.reason ? null : 'job-1', reason: opts.reason ?? null } : opts.response,
    error: opts.rpcError ? { message: 'internal details' } : null,
  }) }))
  const from = vi.fn((table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => table === 'kinnso_ops_members'
      ? { data: opts.ops ? { id: 'ops-1' } : null, error: opts.opsError ? { message: 'ops unavailable' } : null }
      : { data: opts.owner === null ? null : { id: 'sub-1', proof_urls: ['https://www.instagram.com/p/Cabc/'], mission_participants: { creator_id: opts.owner ?? 'owner' } }, error: opts.lookupError ? { message: 'lookup failed' } : null } }
    return query
  })
  return { rpc, from, deps: { db: { rpc, from } as never, userId: 'owner', fetcher: new FakeFetcher() } }
}

it('reserves the submission owner and parsed proof platform before launching', async () => {
  const { deps, rpc, from } = setup()
  expect(await handleVerifySubmission(deps, { submissionId: 'sub-1' })).toEqual({ status: 202, body: { jobId: 'job-1' } })
  expect(rpc).toHaveBeenCalledWith('reserve_worker_launch', expect.objectContaining({ p_kind: 'verification', p_creator_id: 'owner', p_submission_id: 'sub-1', p_platform: 'instagram' }))
  expect(from).not.toHaveBeenCalledWith('kinnso_ops_members')
  expect(verifySubmission).toHaveBeenCalledTimes(1)
})

it('an ops request spends the submission owner quota rather than the ops caller quota', async () => {
  const { deps, rpc } = setup({ owner: 'creator', ops: true })
  expect((await handleVerifySubmission(deps, { submissionId: 'sub-1' })).status).toBe(202)
  expect(rpc).toHaveBeenCalledWith('reserve_worker_launch', expect.objectContaining({ p_creator_id: 'creator' }))
})

it.each([{ owner: null }, { owner: 'stranger' }, { owner: 'stranger', opsError: true }])('does not reserve for an unauthorized or missing submission: %j', async opts => {
  const { deps, rpc } = setup(opts)
  expect(await handleVerifySubmission(deps, { submissionId: 'sub-1' })).toEqual({ status: 404, body: { error: 'submission not found' } })
  expect(rpc).not.toHaveBeenCalled()
  expect(verifySubmission).not.toHaveBeenCalled()
})

it('fails closed when the submission lookup fails', async () => {
  const { deps, rpc } = setup({ lookupError: true })
  expect((await handleVerifySubmission(deps, { submissionId: 'sub-1' })).status).toBe(500)
  expect(rpc).not.toHaveBeenCalled()
})

it('retry reserves the authenticated owner and existing job through the same RPC', async () => {
  const { deps, rpc } = setup()
  expect(await handleVerifyRetry(deps, { jobId: 'job-1' })).toEqual({ status: 202, body: { jobId: 'job-1', retrying: true } })
  expect(rpc).toHaveBeenCalledWith('reserve_worker_launch', expect.objectContaining({ p_kind: 'verification', p_creator_id: 'owner', p_job_id: 'job-1', p_submission_id: undefined }))
  expect(verifySubmission).toHaveBeenCalledTimes(1)
})

it.each([
  ['job_not_found', 404], ['submission_not_found', 404], ['job_not_retryable', 409],
  ['verification_already_in_progress', 429], ['too_many_active_jobs', 429], ['daily_quota_exceeded', 429],
])('does not launch on a rejected reservation: %s', async (reason, status) => {
  const { deps } = setup({ reason: reason as string })
  expect((await handleVerifyRetry(deps, { jobId: 'job-1' })).status).toBe(status)
  expect(verifySubmission).not.toHaveBeenCalled()
})

it.each([{ rpcError: true }, { response: null }, { response: {} }, { reason: 'unrecognized' }])('does not launch without a successful reservation: %j', async opts => {
  const { deps } = setup(opts)
  expect(await handleVerifySubmission(deps, { submissionId: 'sub-1' })).toEqual({ status: 500, body: { error: 'internal error' } })
  expect(verifySubmission).not.toHaveBeenCalled()
})
