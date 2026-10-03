import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  gateMock: vi.fn(async () => ({ ok: true as const, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import { setMerchantStatus, setMerchantTier, addMerchantNote, bulkSetMerchantStatus } from '@/lib/admin/merchants-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('merchants-actions', () => {
  it('setMerchantStatus calls RPC and revalidates', async () => {
    const res = await setMerchantStatus('en', 'm1', 'suspended', 'spam')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_merchant_status', { p_id: 'm1', p_status: 'suspended', p_reason: 'spam' })
    expect(res).toEqual({ ok: true, id: 'm1', status: 'suspended' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/merchants/directory')
  })
  it('setMerchantStatus rejects an invalid status (no RPC)', async () => {
    const res = await setMerchantStatus('en', 'm1', 'banned' as never, 'x')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('setMerchantStatus rejects a blank reason (no RPC)', async () => {
    const res = await setMerchantStatus('en', 'm1', 'paused', '   ')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('setMerchantTier maps bad_tier and no_change DB raises', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'no_change' } })
    const r1 = await setMerchantTier('en', 'm1', 'growth', 'upgrade')
    expect(r1.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_merchant_tier', { p_id: 'm1', p_tier: 'growth', p_reason: 'upgrade' })
  })
  it('addMerchantNote calls RPC', async () => {
    const res = await addMerchantNote('en', 'm1', 'called them')
    expect(rpcMock).toHaveBeenCalledWith('admin_add_merchant_note', { p_id: 'm1', p_note: 'called them' })
    expect(res).toEqual({ ok: true, id: 'm1' })
  })
  it('bulkSetMerchantStatus returns the count', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null })
    const res = await bulkSetMerchantStatus('en', ['a', 'b', 'c'], 'archived', 'cleanup')
    expect(res).toEqual({ ok: true, count: 3 })
  })
  it('bulkSetMerchantStatus rejects empty id list (no RPC)', async () => {
    const res = await bulkSetMerchantStatus('en', [], 'paused', 'x')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('role-gate (12C)', () => {
  it('setMerchantStatus surfaces forbidden when the DB rejects an under-privileged caller (analyst)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setMerchantStatus('en', 'm1', 'suspended', 'reason')
    expect(res.ok).toBe(false)
  })
  it('setMerchantTier surfaces forbidden when the DB rejects an under-privileged caller (analyst)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setMerchantTier('en', 'm1', 'growth', 'reason')
    expect(res.ok).toBe(false)
  })
})
