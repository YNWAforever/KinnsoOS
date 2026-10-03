import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ActionFailure } from '@/lib/admin/result'

const { gateMock, getUserMock, rpcMock } = vi.hoisted(() => ({
  gateMock: vi.fn<() => Promise<{ ok: true; user: { id: string } } | ActionFailure>>(async () => ({ ok: true, user: { id: 'c1' } })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'c1' } } })),
  rpcMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))

import { redeemPerkAction } from '@/lib/perks/actions'

beforeEach(() => {
  gateMock.mockResolvedValue({ ok: true, user: { id: 'c1' } })
  getUserMock.mockResolvedValue({ data: { user: { id: 'c1' } } })
  // rpc(...).single() shape
  rpcMock.mockReturnValue({ single: async () => ({ data: { redemption_type: 'code', redemption_value: 'CODE10' }, error: null }) })
})

describe('redeemPerkAction', () => {
  it('rejects a non-creator before calling the RPC', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Creator access is required'] } })
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('returns the redemption value at tier', async () => {
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.redemptionType).toBe('code'); expect(r.value).toBe('CODE10') }
  })
  it('maps below_tier to a friendly error', async () => {
    rpcMock.mockReturnValueOnce({ single: async () => ({ data: null, error: { message: 'below_tier' } }) })
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/tier/i)
  })
  it('maps perk_not_found to a friendly error', async () => {
    rpcMock.mockReturnValueOnce({ single: async () => ({ data: null, error: { message: 'perk_not_found' } }) })
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/no longer available/i)
  })
})
