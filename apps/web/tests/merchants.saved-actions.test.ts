import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gateMock, serverClientMock, revalidateMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })),
  serverClientMock: vi.fn(),
  revalidateMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: serverClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import {
  saveCreatorAction,
  unsaveCreatorAction,
  setSavedNoteAction,
} from '@/lib/merchants/saved-actions'

/** Captures the upsert/update/delete payload the action sends. */
function makeClient(opts: { error?: unknown } = {}) {
  const calls: {
    table?: string
    upsert?: Record<string, unknown>
    update?: Record<string, unknown>
    deleted?: boolean
    eqs: Record<string, unknown>[]
  } = { eqs: [] }
  const builder = {
    upsert: (row: Record<string, unknown>) => {
      calls.upsert = row
      return Promise.resolve({ error: opts.error ?? null })
    },
    update: (row: Record<string, unknown>) => {
      calls.update = row
      return builder
    },
    delete: () => {
      calls.deleted = true
      return builder
    },
    eq: (col: string, val: unknown) => {
      calls.eqs.push({ [col]: val })
      // terminal eq resolves the query
      return Object.assign(
        Promise.resolve({ error: opts.error ?? null }),
        builder,
      )
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

beforeEach(() => {
  gateMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
  revalidateMock.mockClear()
})

describe('saveCreatorAction', () => {
  it('rejects a non-merchant caller before writing', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['x'] } } as never)
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await saveCreatorAction('en', 'c1')
    expect(r.ok).toBe(false)
    expect(calls.upsert).toBeUndefined()
  })
  it('upserts the merchant+creator row and revalidates', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await saveCreatorAction('en', 'c1')
    expect(r.ok).toBe(true)
    expect(calls.table).toBe('merchant_saved_creators')
    expect(calls.upsert).toMatchObject({ merchant_id: 'm1', creator_id: 'c1' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/merchants/dashboard/creators')
  })
  it('returns a form error when the write fails', async () => {
    const { client } = makeClient({ error: { message: 'boom' } })
    serverClientMock.mockResolvedValue(client)
    const r = await saveCreatorAction('en', 'c1')
    expect(r.ok).toBe(false)
  })
})

describe('unsaveCreatorAction', () => {
  it('rejects a non-merchant caller before writing', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['x'] } } as never)
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await unsaveCreatorAction('en', 'c1')
    expect(r.ok).toBe(false)
    expect(calls.deleted).toBeUndefined()
  })
  it('deletes the merchant+creator row and revalidates', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await unsaveCreatorAction('en', 'c1')
    expect(r.ok).toBe(true)
    expect(calls.table).toBe('merchant_saved_creators')
    expect(calls.deleted).toBe(true)
    expect(calls.eqs).toContainEqual({ merchant_id: 'm1' })
    expect(calls.eqs).toContainEqual({ creator_id: 'c1' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/merchants/dashboard/creators')
  })
})

describe('setSavedNoteAction', () => {
  it('rejects a non-merchant caller before writing', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['x'] } } as never)
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await setSavedNoteAction('en', 'c1', 'hi')
    expect(r.ok).toBe(false)
    expect(calls.update).toBeUndefined()
  })
  it('updates the note for the merchant+creator row and revalidates', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await setSavedNoteAction('en', 'c1', '  great fit  ')
    expect(r.ok).toBe(true)
    expect(calls.update).toMatchObject({ note: 'great fit' })
    expect(calls.eqs).toContainEqual({ merchant_id: 'm1' })
    expect(calls.eqs).toContainEqual({ creator_id: 'c1' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/merchants/dashboard/creators')
  })
})
