import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ActionFailure } from '@/lib/admin/result'

const { gateMock, serverClientMock, revalidateMock } = vi.hoisted(() => ({
  gateMock: vi.fn<() => Promise<{ ok: true; user: { id: string } } | ActionFailure>>(async () => ({ ok: true, user: { id: 'c1' } })),
  serverClientMock: vi.fn(),
  revalidateMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: serverClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import { acceptInviteAction } from '@/lib/missions/invite-actions'

/** A client whose `rpc` resolves to a fixed result. */
function makeRpcClient(result: { data?: unknown; error?: unknown }) {
  const calls: { fn?: string; args?: Record<string, unknown> } = {}
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.fn = fn
      calls.args = args
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    },
  }
  return { client, calls }
}

beforeEach(() => {
  gateMock.mockResolvedValue({ ok: true, user: { id: 'c1' } })
  revalidateMock.mockClear()
})

describe('acceptInviteAction', () => {
  it('rejects a non-creator caller before calling the RPC', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Creator access is required'] } })
    const { client, calls } = makeRpcClient({})
    serverClientMock.mockResolvedValue(client)
    const r = await acceptInviteAction('en', 'mission-1')
    expect(r.ok).toBe(false)
    expect(calls.fn).toBeUndefined()
  })

  it('calls accept_mission_invite with the mission and revalidates', async () => {
    const { client, calls } = makeRpcClient({})
    serverClientMock.mockResolvedValue(client)
    const r = await acceptInviteAction('en', 'mission-1')
    expect(r.ok).toBe(true)
    expect(calls.fn).toBe('accept_mission_invite')
    expect(calls.args).toEqual({ p_mission_id: 'mission-1' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/studio/missions')
  })

  it('maps no_invite to a friendly error', async () => {
    const { client } = makeRpcClient({ error: { message: 'no_invite' } })
    serverClientMock.mockResolvedValue(client)
    const r = await acceptInviteAction('en', 'mission-1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form?.[0]).toMatch(/invit/i)
  })

  it('falls back to a generic error for an unmapped failure', async () => {
    const { client } = makeRpcClient({ error: { message: 'something_else' } })
    serverClientMock.mockResolvedValue(client)
    const r = await acceptInviteAction('en', 'mission-1')
    expect(r.ok).toBe(false)
  })
})
