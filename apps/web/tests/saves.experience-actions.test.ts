import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      if (table !== 'experience_saves') throw new Error(`unexpected table ${table}`)
      return {
        upsert: upsertMock,
        delete: () => ({ eq: () => ({ eq: deleteEqMock }) }),
      }
    },
  }),
}))

import { saveExperienceAction, unsaveExperienceAction } from '@/lib/saves/experience-actions'

beforeEach(() => { vi.clearAllMocks() })

describe('saveExperienceAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await saveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, reason: 'auth', errors: { form: ['Sign in is required'] } })
  })

  it('upserts the save for a signed-in traveller and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await saveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: true, experienceId: 'e1' })
    expect(upsertMock).toHaveBeenCalledWith(
      { experience_id: 'e1', traveler_user_id: 'u1' },
      { onConflict: 'experience_id,traveler_user_id', ignoreDuplicates: true },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })

  it('returns a form error and never revalidates when the upsert itself fails (e.g. a permission/grant error)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    upsertMock.mockResolvedValueOnce({ error: { message: 'permission denied for table experience_saves' } })
    const result = await saveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, reason: 'failed', errors: { form: ['Experience could not be saved'] } })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('is idempotent: a repeat save for the same experience/traveller pair upserts again rather than erroring', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const first = await saveExperienceAction('en', 'e1')
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const second = await saveExperienceAction('en', 'e1')
    expect(first).toEqual({ ok: true, experienceId: 'e1' })
    expect(second).toEqual({ ok: true, experienceId: 'e1' })
    expect(upsertMock).toHaveBeenCalledTimes(2)
    for (const call of upsertMock.mock.calls) {
      expect(call).toEqual([
        { experience_id: 'e1', traveler_user_id: 'u1' },
        { onConflict: 'experience_id,traveler_user_id', ignoreDuplicates: true },
      ])
    }
  })
})

describe('unsaveExperienceAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await unsaveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, reason: 'auth', errors: { form: ['Sign in is required'] } })
  })

  it('deletes the save for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await unsaveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: true, experienceId: 'e1' })
  })

  it('returns a form error and never revalidates when the delete itself fails', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    deleteEqMock.mockResolvedValueOnce({ error: { message: 'permission denied for table experience_saves' } })
    const result = await unsaveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, reason: 'failed', errors: { form: ['Experience could not be removed'] } })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
