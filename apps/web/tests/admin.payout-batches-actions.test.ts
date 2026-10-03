import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
type GateResult = { ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: { batch_id: 'b1' }, error: null })),
  gateMock: vi.fn(async (): Promise<GateResult> => ({ ok: true, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import { createPayoutBatch, markPayoutBatchPaid, cancelPayoutBatch } from '@/lib/admin/payout-batches-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: { batch_id: 'b1' }, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('createPayoutBatch', () => {
  const input = { creatorId: 'c1', currency: 'HKD', amount: 1500, idempotencyKey: 'key-1' }

  it('calls admin_create_payout_batch and returns the batch id', async () => {
    const res = await createPayoutBatch('en', input, 'monthly payout run')
    expect(rpcMock).toHaveBeenCalledWith('admin_create_payout_batch', {
      p_creator_id: 'c1', p_currency: 'HKD', p_amount: 1500, p_idempotency_key: 'key-1', p_reason: 'monthly payout run',
    })
    expect(res).toEqual({ ok: true, batchId: 'b1' })
    expect(revalidateMock).toHaveBeenCalled()
  })

  it('fails validation when amount is not positive (no RPC call)', async () => {
    const res = await createPayoutBatch('en', { ...input, amount: 0 }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('maps idempotency_conflict to a friendly message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'idempotency_conflict' } })
    const res = await createPayoutBatch('en', input, 'reason')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/already submitted/i)
  })

  it('maps batch_already_pending to a friendly message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'batch_already_pending' } })
    const res = await createPayoutBatch('en', input, 'reason')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/pending batch/i)
  })
})

describe('markPayoutBatchPaid', () => {
  it('calls admin_mark_payout_paid', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    const res = await markPayoutBatchPaid('en', 'b1', 'wired via FPS')
    expect(rpcMock).toHaveBeenCalledWith('admin_mark_payout_paid', { p_batch_id: 'b1', p_reason: 'wired via FPS' })
    expect(res).toEqual({ ok: true, id: 'b1' })
  })

  it('fails validation when reason is blank (no RPC call)', async () => {
    const res = await markPayoutBatchPaid('en', 'b1', '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('cancelPayoutBatch', () => {
  const input = { batchId: 'b1', idempotencyKey: 'key-2' }

  it('calls admin_cancel_payout', async () => {
    rpcMock.mockResolvedValueOnce({ data: { decision_id: 'd1' }, error: null })
    const res = await cancelPayoutBatch('en', input, 'creator requested a different currency')
    expect(rpcMock).toHaveBeenCalledWith('admin_cancel_payout', {
      p_batch_id: 'b1', p_idempotency_key: 'key-2', p_reason: 'creator requested a different currency',
    })
    expect(res).toEqual({ ok: true, id: 'b1' })
  })

  it('surfaces forbidden from a non-admin ops role', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await cancelPayoutBatch('en', input, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('role-gate (R10.2)', () => {
  it('createPayoutBatch surfaces forbidden when the DB rejects an under-privileged caller', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await createPayoutBatch('en', { creatorId: 'c1', currency: 'HKD', amount: 1500, idempotencyKey: 'key-1' }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalled()
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/active ops access is required/i)
  })
  it('markPayoutBatchPaid surfaces forbidden when the DB rejects an under-privileged caller', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await markPayoutBatchPaid('en', 'b1', 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalled()
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/active ops access is required/i)
  })
  it('cancelPayoutBatch surfaces forbidden when the DB rejects an under-privileged caller', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await cancelPayoutBatch('en', { batchId: 'b1', idempotencyKey: 'key-2' }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalled()
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/active ops access is required/i)
  })
})
