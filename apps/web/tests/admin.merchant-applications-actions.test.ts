// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { requireOpsActionMock, rpcMock } = vi.hoisted(() => ({
  requireOpsActionMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: requireOpsActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ rpc: rpcMock }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveMerchantApplicationAction, rejectMerchantApplicationAction } from '@/lib/admin/merchant-applications-actions'

beforeEach(() => {
  requireOpsActionMock.mockReset()
  rpcMock.mockReset()
})

describe('approveMerchantApplicationAction', () => {
  it('rejects non-ops callers before calling the RPC', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await approveMerchantApplicationAction('en', 'app1', 'looks great')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a blank reason before calling the RPC', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    const res = await approveMerchantApplicationAction('en', 'app1', '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls the RPC and returns the new merchant profile id on success', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    rpcMock.mockResolvedValue({ data: 'profile-1', error: null })
    const res = await approveMerchantApplicationAction('en', 'app1', 'looks great')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.merchantProfileId).toBe('profile-1')
    expect(rpcMock).toHaveBeenCalledWith('admin_approve_merchant_application', { p_id: 'app1', p_reason: 'looks great' })
  })

  it('maps a not_pending RPC error to a friendly message', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not_pending' } })
    const res = await approveMerchantApplicationAction('en', 'app1', 'looks great')
    expect(res.ok).toBe(false)
  })

  it('maps an already_merchant RPC error to a friendly message', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'already_merchant' } })
    const res = await approveMerchantApplicationAction('en', 'app1', 'looks great')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toBe('This user already has a merchant profile.')
  })
})

describe('rejectMerchantApplicationAction', () => {
  it('calls the reject RPC on success', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await rejectMerchantApplicationAction('en', 'app1', 'not a fit')
    expect(res.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_reject_merchant_application', { p_id: 'app1', p_reason: 'not a fit' })
  })
})
