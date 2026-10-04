// apps/web/tests/saves.guide-actions.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const { getUserMock, upsertMock, deleteEqMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  upsertMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
  deleteEqMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
}))
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table !== 'guide_saves') throw new Error(`unexpected table ${table}`)
      return {
        upsert: upsertMock,
        delete: () => ({ eq: () => ({ eq: deleteEqMock }) }),
      }
    },
  }),
}))

import { saveGuideAction, unsaveGuideAction } from '@/lib/saves/guide-actions'

beforeEach(() => { vi.clearAllMocks() })

describe('saveGuideAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await saveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, reason: 'auth', errors: { form: ['Sign in is required'] } })
  })

  it('upserts the save for a signed-in traveller and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await saveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: true, guideId: 'g1' })
    expect(upsertMock).toHaveBeenCalledWith(
      { guide_id: 'g1', traveler_user_id: 'u1' },
      { onConflict: 'guide_id,traveler_user_id', ignoreDuplicates: true },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })

  it('returns a form error and never revalidates when the upsert itself fails (e.g. a permission/grant error)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    upsertMock.mockResolvedValueOnce({ error: { message: 'permission denied for table guide_saves' } })
    const result = await saveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, reason: 'failed', errors: { form: ['Guide could not be saved'] } })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('is idempotent: a repeat save for the same guide/traveller pair upserts again rather than erroring', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const first = await saveGuideAction('en', 'g1')
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const second = await saveGuideAction('en', 'g1')
    expect(first).toEqual({ ok: true, guideId: 'g1' })
    expect(second).toEqual({ ok: true, guideId: 'g1' })
    expect(upsertMock).toHaveBeenCalledTimes(2)
    for (const call of upsertMock.mock.calls) {
      expect(call).toEqual([
        { guide_id: 'g1', traveler_user_id: 'u1' },
        { onConflict: 'guide_id,traveler_user_id', ignoreDuplicates: true },
      ])
    }
  })
})

describe('unsaveGuideAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await unsaveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, reason: 'auth', errors: { form: ['Sign in is required'] } })
  })

  it('deletes the save for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await unsaveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: true, guideId: 'g1' })
  })

  it('returns a form error and never revalidates when the delete itself fails', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    deleteEqMock.mockResolvedValueOnce({ error: { message: 'permission denied for table guide_saves' } })
    const result = await unsaveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, reason: 'failed', errors: { form: ['Guide could not be removed'] } })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
