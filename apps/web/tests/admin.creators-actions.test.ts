import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
type GateResult = { ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  gateMock: vi.fn(async (): Promise<GateResult> => ({ ok: true, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import {
  setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote, bulkSetCreatorStatus,
  setSettlementStatus, setCreatorListed,
} from '@/lib/admin/creators-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('setCreatorStatus', () => {
  it('calls admin_set_creator_status and returns ok', async () => {
    const res = await setCreatorStatus('en', 'c1', 'suspended', 'spam')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_creator_status', { p_id: 'c1', p_status: 'suspended', p_reason: 'spam' })
    expect(res).toEqual({ ok: true, id: 'c1', status: 'suspended' })
    expect(revalidateMock).toHaveBeenCalled()
  })
  it('fails validation when reason is blank (no RPC call)', async () => {
    const res = await setCreatorStatus('en', 'c1', 'banned', '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/reason/i)
  })
  it('rejects an invalid status', async () => {
    const res = await setCreatorStatus('en', 'c1', 'deleted' as never, 'x')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps a bad_transition DB raise to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'bad_transition' } })
    const res = await setCreatorStatus('en', 'c1', 'suspended', 'x')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/transition|cannot/i)
  })
  it('returns the gate failure for a non-ops caller', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await setCreatorStatus('en', 'c1', 'active', 'x')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('reinstateCreator', () => {
  it('calls admin_reinstate_creator', async () => {
    const res = await reinstateCreator('en', 'c1', 'appeal approved')
    expect(rpcMock).toHaveBeenCalledWith('admin_reinstate_creator', { p_id: 'c1', p_reason: 'appeal approved' })
    expect(res).toEqual({ ok: true, id: 'c1', status: 'active' })
  })
  it('maps not_banned to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'not_banned' } })
    const res = await reinstateCreator('en', 'c1', 'x')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/banned/i)
  })
})

describe('setCreatorVerified', () => {
  it('calls admin_set_creator_verified with the boolean', async () => {
    const res = await setCreatorVerified('en', 'c1', true, 'passed KYC')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_creator_verified', { p_id: 'c1', p_verified: true, p_reason: 'passed KYC' })
    expect(res).toEqual({ ok: true, id: 'c1', verified: true })
  })
})

describe('setCreatorListed', () => {
  it('calls the audited RPC and revalidates public discovery', async () => {
    const res = await setCreatorListed('en', 'c1', true, 'Launch cohort')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_creator_listed', {
      p_id: 'c1', p_is_listed: true, p_reason: 'Launch cohort',
    })
    expect(res).toEqual({ ok: true, id: 'c1', isListed: true })
    expect(revalidateMock).toHaveBeenCalledWith('/en/creators')
    expect(revalidateMock).toHaveBeenCalledWith('/sitemap.xml')
  })

  it('rejects a blank reason without calling the RPC', async () => {
    const res = await setCreatorListed('en', 'c1', true, '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('maps forbidden to active-ops copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setCreatorListed('en', 'c1', true, 'Launch cohort')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toBe('Active ops access is required.')
  })
})

describe('addCreatorNote', () => {
  it('calls admin_add_creator_note', async () => {
    const res = await addCreatorNote('en', 'c1', 'called creator')
    expect(rpcMock).toHaveBeenCalledWith('admin_add_creator_note', { p_id: 'c1', p_note: 'called creator' })
    expect(res).toEqual({ ok: true, id: 'c1' })
  })
  it('fails on blank note', async () => {
    const res = await addCreatorNote('en', 'c1', '  ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('bulkSetCreatorStatus', () => {
  it('calls admin_bulk_set_creator_status and returns the changed count', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null })
    const res = await bulkSetCreatorStatus('en', ['a', 'b', 'c'], 'suspended', 'cleanup')
    expect(rpcMock).toHaveBeenCalledWith('admin_bulk_set_creator_status', { p_ids: ['a', 'b', 'c'], p_status: 'suspended', p_reason: 'cleanup' })
    expect(res).toEqual({ ok: true, count: 3 })
  })
  it('rejects an empty id list (no RPC call)', async () => {
    const res = await bulkSetCreatorStatus('en', [], 'banned', 'x')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('setSettlementStatus', () => {
  it('calls admin_set_settlement_status and revalidates on success', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    const res = await setSettlementStatus('en', 'set-1', { status: 'paid', creatorPayoutStatus: 'paid' }, 'invoice cleared')
    expect(res).toEqual({ ok: true, id: 'set-1' })
    expect(rpcMock).toHaveBeenCalledWith('admin_set_settlement_status', {
      p_id: 'set-1', p_status: 'paid', p_creator_payout_status: 'paid',
      p_kinnso_commission_status: null, p_affiliate_commission_status: null,
      p_allow_revert: false, p_reason: 'invoice cleared',
    })
    expect(revalidateMock).toHaveBeenCalled()
  })
  it('requires a reason (no RPC call)', async () => {
    const res = await setSettlementStatus('en', 'set-1', { status: 'paid' }, '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects when no field is provided (no RPC call)', async () => {
    const res = await setSettlementStatus('en', 'set-1', {}, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects an invalid overall status without hitting the DB', async () => {
    const res = await setSettlementStatus('en', 'set-1', { status: 'refunded' as never }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects an invalid leg status without hitting the DB', async () => {
    const res = await setSettlementStatus('en', 'set-1', { creatorPayoutStatus: 'partially_paid' as never }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps a bad_transition DB raise to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'bad_transition' } })
    const res = await setSettlementStatus('en', 'set-1', { status: 'pending' }, 'reason')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/transition|cannot/i)
  })
  it('returns the gate failure for a non-ops caller', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await setSettlementStatus('en', 'set-1', { status: 'paid' }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('role-gate (12C)', () => {
  it('setCreatorStatus surfaces forbidden when the DB rejects an under-privileged caller', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setCreatorStatus('en', 'c1', 'active', 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalled()
  })
  it('setCreatorVerified surfaces forbidden when the DB rejects an under-privileged caller', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setCreatorVerified('en', 'c1', true, 'reason')
    expect(res.ok).toBe(false)
  })
  it('setSettlementStatus surfaces forbidden when a moderator (not admin) calls it', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setSettlementStatus('en', 'set-1', { status: 'paid' }, 'reason')
    expect(res.ok).toBe(false)
  })
})
