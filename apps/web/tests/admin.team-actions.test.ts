import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock:        vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  gateMock:       vi.fn(async () => ({ ok: true as const, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache',          () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard',   () => ({ requireOpsAction: gateMock }))

import {
  inviteMemberAction, revokeInviteAction,
  setMemberRoleAction, suspendMemberAction, reactivateMemberAction,
} from '@/lib/admin/team-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('inviteMemberAction', () => {
  it('calls admin_invite_ops_member and returns the token', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'abc123', error: null })
    const res = await inviteMemberAction('en', 'test@example.com', 'moderator')
    expect(rpcMock).toHaveBeenCalledWith('admin_invite_ops_member', { p_email: 'test@example.com', p_role: 'moderator' })
    expect(res).toEqual({ ok: true, token: 'abc123' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team')
  })
  it('rejects an invalid role', async () => {
    const res = await inviteMemberAction('en', 'x@x.com', 'superadmin' as never)
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects a blank email', async () => {
    const res = await inviteMemberAction('en', '   ', 'analyst')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps forbidden DB error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await inviteMemberAction('en', 'x@x.com', 'analyst')
    expect(res.ok).toBe(false)
  })
})

describe('revokeInviteAction', () => {
  it('calls admin_revoke_ops_invite and revalidates', async () => {
    const res = await revokeInviteAction('en', 'inv1')
    expect(rpcMock).toHaveBeenCalledWith('admin_revoke_ops_invite', { p_invite_id: 'inv1' })
    expect(res).toEqual({ ok: true })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team')
  })
})

describe('setMemberRoleAction', () => {
  it('calls admin_set_ops_member_role and revalidates', async () => {
    const res = await setMemberRoleAction('en', 'm1', 'admin', 'promoting to admin')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_ops_member_role', { p_member_id: 'm1', p_role: 'admin', p_reason: 'promoting to admin' })
    expect(res).toEqual({ ok: true })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team/directory')
  })
  it('rejects a blank reason', async () => {
    const res = await setMemberRoleAction('en', 'm1', 'admin', '   ')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects an invalid role', async () => {
    const res = await setMemberRoleAction('en', 'm1', 'superadmin' as never, 'reason')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps self_role_change DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'self_role_change' } })
    const res = await setMemberRoleAction('en', 'm1', 'moderator', 'oops')
    expect(res.ok).toBe(false)
  })
  it('maps last_owner DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'last_owner' } })
    const res = await setMemberRoleAction('en', 'm1', 'admin', 'demote')
    expect(res.ok).toBe(false)
  })
})

describe('suspendMemberAction', () => {
  it('calls admin_suspend_ops_member', async () => {
    const res = await suspendMemberAction('en', 'm1', 'policy violation')
    expect(rpcMock).toHaveBeenCalledWith('admin_suspend_ops_member', { p_member_id: 'm1', p_reason: 'policy violation' })
    expect(res).toEqual({ ok: true })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team/directory')
  })
  it('rejects blank reason', async () => {
    const res = await suspendMemberAction('en', 'm1', '')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps self_suspend DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'self_suspend' } })
    const res = await suspendMemberAction('en', 'm1', 'reason')
    expect(res.ok).toBe(false)
  })
  it('maps last_owner DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'last_owner' } })
    const res = await suspendMemberAction('en', 'm1', 'reason')
    expect(res.ok).toBe(false)
  })
})

describe('reactivateMemberAction', () => {
  it('calls admin_reactivate_ops_member', async () => {
    const res = await reactivateMemberAction('en', 'm1', 'reinstated')
    expect(rpcMock).toHaveBeenCalledWith('admin_reactivate_ops_member', { p_member_id: 'm1', p_reason: 'reinstated' })
    expect(res).toEqual({ ok: true })
  })
  it('rejects blank reason', async () => {
    const res = await reactivateMemberAction('en', 'm1', '  ')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
})
