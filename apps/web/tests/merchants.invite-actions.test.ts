import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gateMock, serverClientMock, revalidateMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })),
  serverClientMock: vi.fn(),
  revalidateMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: serverClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import { inviteCreatorAction } from '@/lib/merchants/invite-actions'
import { listMerchantPublishedMissions } from '@/lib/merchants/invite'

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
  gateMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
  revalidateMock.mockClear()
})

describe('inviteCreatorAction', () => {
  it('rejects a non-merchant caller before calling the RPC', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['x'] } } as never)
    const { client, calls } = makeRpcClient({ data: 'invite-1' })
    serverClientMock.mockResolvedValue(client)
    const r = await inviteCreatorAction('en', 'mission-1', 'creator-1')
    expect(r.ok).toBe(false)
    expect(calls.fn).toBeUndefined()
  })

  it('calls merchant_invite_creator with the mission + creator and revalidates', async () => {
    const { client, calls } = makeRpcClient({ data: 'invite-1' })
    serverClientMock.mockResolvedValue(client)
    const r = await inviteCreatorAction('en', 'mission-1', 'creator-1')
    expect(r.ok).toBe(true)
    expect(calls.fn).toBe('merchant_invite_creator')
    expect(calls.args).toEqual({ p_mission_id: 'mission-1', p_creator_id: 'creator-1' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/merchants/dashboard/creators')
  })

  it('maps invite_quota_exceeded to a friendly error', async () => {
    const { client } = makeRpcClient({ error: { message: 'invite_quota_exceeded' } })
    serverClientMock.mockResolvedValue(client)
    const r = await inviteCreatorAction('en', 'mission-1', 'creator-1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form?.[0]).toMatch(/quota/i)
  })

  it('maps already_participant to a friendly error', async () => {
    const { client } = makeRpcClient({ error: { message: 'already_participant' } })
    serverClientMock.mockResolvedValue(client)
    const r = await inviteCreatorAction('en', 'mission-1', 'creator-1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form?.[0]).toMatch(/already/i)
  })

  it('maps not_authorized to a friendly error', async () => {
    const { client } = makeRpcClient({ error: { message: 'not_authorized' } })
    serverClientMock.mockResolvedValue(client)
    const r = await inviteCreatorAction('en', 'mission-1', 'creator-1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form?.[0]).toMatch(/authori/i)
  })

  it('maps creator_not_found to a friendly error', async () => {
    const { client } = makeRpcClient({ error: { message: 'creator_not_found' } })
    serverClientMock.mockResolvedValue(client)
    const r = await inviteCreatorAction('en', 'mission-1', 'creator-1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form?.[0]).toMatch(/creator/i)
  })

  it('falls back to a generic error for an unmapped failure', async () => {
    const { client } = makeRpcClient({ error: { message: 'something_else' } })
    serverClientMock.mockResolvedValue(client)
    const r = await inviteCreatorAction('en', 'mission-1', 'creator-1')
    expect(r.ok).toBe(false)
  })
})

describe('listMerchantPublishedMissions', () => {
  function makeListClient(rows: { id: string; title: string }[]) {
    const calls: { table?: string; selected?: string; eqs: Record<string, unknown>[] } = { eqs: [] }
    const builder = {
      select: (cols: string) => {
        calls.selected = cols
        return builder
      },
      eq: (col: string, val: unknown) => {
        calls.eqs.push({ [col]: val })
        return Object.assign(Promise.resolve({ data: rows, error: null }), builder)
      },
    }
    const client = {
      from: (table: string) => {
        calls.table = table
        return builder
      },
    }
    return { client, calls }
  }

  it('returns the merchant\'s published merchant-source missions as {id,title}[]', async () => {
    const { client, calls } = makeListClient([
      { id: 'mission-1', title: 'Spring Tour' },
      { id: 'mission-2', title: 'Summer Eats' },
    ])
    const result = await listMerchantPublishedMissions(client as never, 'm1')
    expect(calls.table).toBe('missions')
    expect(calls.eqs).toContainEqual({ merchant_profile_id: 'm1' })
    expect(calls.eqs).toContainEqual({ status: 'published' })
    expect(calls.eqs).toContainEqual({ mission_source: 'merchant' })
    expect(result).toEqual([
      { id: 'mission-1', title: 'Spring Tour' },
      { id: 'mission-2', title: 'Summer Eats' },
    ])
  })
})
