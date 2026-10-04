import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gateMock, rpcMock, revalidateMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'ops1' } })),
  rpcMock: vi.fn(async () => ({ error: null })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))

import { setUserStatusAction } from '@/lib/admin/users-actions'

beforeEach(() => {
  gateMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } } as never)
  rpcMock.mockResolvedValue({ error: null } as never)
  revalidateMock.mockClear()
})

describe('setUserStatusAction', () => {
  it('rejects a non-ops caller', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['nope'] } } as never)
    expect((await setUserStatusAction('en', 'creator', 'c1', 'suspended')).ok).toBe(false)
  })
  it('rejects a bad kind', async () => {
    expect((await setUserStatusAction('en', 'admin' as never, 'c1', 'suspended')).ok).toBe(false)
  })
  it('rejects kind=merchant now that merchants are managed in the merchants console', async () => {
    rpcMock.mockClear()
    const r = await setUserStatusAction('en', 'merchant' as never, 'm1', 'suspended')
    expect(r.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects a bad status', async () => {
    expect((await setUserStatusAction('en', 'creator', 'c1', 'paused' as never)).ok).toBe(false)
  })
  it('suspends a creator via the RPC and revalidates the page', async () => {
    const r = await setUserStatusAction('en', 'creator', 'c1', 'suspended')
    expect(r.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_user_status', { p_kind: 'creator', p_id: 'c1', p_status: 'suspended' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/users')
  })
  it('maps an unrecognized DB error to the generic fallback', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'some unexpected db failure' } } as never)
    const r = await setUserStatusAction('en', 'creator', 'c1', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/could not be changed/i)
    expect(revalidateMock).not.toHaveBeenCalled()
  })
  it('maps cannot_suspend_self to a friendly error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'cannot_suspend_self' } } as never)
    const r = await setUserStatusAction('en', 'ops', 'o1', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/your own ops/i)
  })
  it('maps last_active_ops to a friendly error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'last_active_ops' } } as never)
    const r = await setUserStatusAction('en', 'ops', 'o1', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/last active ops/i)
  })
  it('maps not_found (stale/deleted user) to a friendly error, not the generic fallback', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'not_found' } } as never)
    const r = await setUserStatusAction('en', 'creator', 'gone', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.form[0]).toMatch(/no longer exists/i)
      expect(r.errors.form[0]).not.toMatch(/could not be changed/i)
    }
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})
