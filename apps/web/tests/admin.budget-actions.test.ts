import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
type GateResult = { ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }

// Mirrors apps/web/tests/admin.mission-review-actions.test.ts's proven pattern for testing an
// action built on requireOpsAction: mock @/lib/admin/guard directly rather than
// re-deriving getAuthorizationContext's internals (verified against the real
// requireOpsAction in apps/web/lib/admin/guard.ts, which returns exactly this shape).
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  gateMock: vi.fn(async (): Promise<GateResult> => ({ ok: true, user: { id: 'ops-1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import { creditMerchantBudget, setBudgetEnforcement } from '@/lib/admin/budget-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'ops-1' } })
  revalidateMock.mockReset()
})

describe('creditMerchantBudget', () => {
  it('calls admin_credit_merchant_budget and revalidates the merchant detail page', async () => {
    const result = await creditMerchantBudget('en', 'merchant-1', 250, 'Pilot funding')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_credit_merchant_budget', {
      p_merchant_profile_id: 'merchant-1', p_amount: 250, p_reason: 'Pilot funding',
    })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/merchants/merchant-1')
  })

  it('rejects a zero amount before calling the RPC', async () => {
    const result = await creditMerchantBudget('en', 'merchant-1', 0, 'reason')
    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a blank reason before calling the RPC', async () => {
    const result = await creditMerchantBudget('en', 'merchant-1', 100, '   ')
    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a sub-cent amount with the precision message before calling the RPC', async () => {
    const result = await creditMerchantBudget('en', 'merchant-1', 0.001, 'reason')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/2 decimal places/i)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an over-magnitude amount with the precision message before calling the RPC', async () => {
    const result = await creditMerchantBudget('en', 'merchant-1', 99999999999.99, 'reason')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/2 decimal places/i)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('accepts genuine two-decimal amounts that are not exact in IEEE-754 (regression)', async () => {
    // amount * 100 for these values lands off-integer in floating point (e.g.
    // 19.99 * 100 === 1998.9999999999998) -- an exact-equality precision check would have
    // wrongly rejected every one of these as sub-cent, even though they're valid currency.
    for (const amount of [19.99, 0.29, 1.15, 0.07, 1234567.89]) {
      rpcMock.mockClear()
      const result = await creditMerchantBudget('en', 'merchant-1', amount, 'reason')
      expect(result.ok).toBe(true)
      expect(rpcMock).toHaveBeenCalledWith('admin_credit_merchant_budget', {
        p_merchant_profile_id: 'merchant-1', p_amount: amount, p_reason: 'reason',
      })
    }
  })

  it('maps insufficient_budget to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'insufficient_budget' } })
    const result = await creditMerchantBudget('en', 'merchant-1', -500, 'clawback')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/below zero/i)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('returns the gate failure for a non-ops caller without calling the RPC', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const result = await creditMerchantBudget('en', 'merchant-1', 250, 'Pilot funding')
    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('setBudgetEnforcement', () => {
  it('calls admin_set_budget_enforcement', async () => {
    const result = await setBudgetEnforcement('en', 'merchant-1', true, 'Pilot go-live')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_budget_enforcement', {
      p_merchant_profile_id: 'merchant-1', p_enforced: true, p_reason: 'Pilot go-live',
    })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/merchants/merchant-1')
  })

  it('maps not_found (no budget row yet) to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'not_found' } })
    const result = await setBudgetEnforcement('en', 'merchant-1', true, 'reason')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/credit it first/i)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('rejects a blank reason before calling the RPC', async () => {
    const result = await setBudgetEnforcement('en', 'merchant-1', true, '')
    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
