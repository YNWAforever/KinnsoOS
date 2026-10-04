import { describe, expect, it, vi } from 'vitest'

const { getUserMock, insertMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  insertMock: vi.fn(async (): Promise<{ error: { code: string; message: string } | null }> => ({ error: null })),
}))
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table !== 'reviews') throw new Error(`unexpected table ${table}`)
      return { insert: insertMock }
    },
  }),
}))

import { submitReviewAction } from '@/lib/reviews/actions'

describe('submitReviewAction', () => {
  it('rejects an out-of-range rating before ever calling Supabase', async () => {
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 0, body: '' })
    expect(result).toEqual({ ok: false, errors: { rating: ['Choose a rating from 1 to 5 stars'] } })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 5, body: '' })
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('inserts a trimmed review, treats an empty body as null, and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await submitReviewAction('en', 'b1', 'e1', 'g1', { rating: 5, body: '  Loved it!  ' })
    expect(result).toEqual({ ok: true, bookingId: 'b1' })
    expect(insertMock).toHaveBeenCalledWith({
      booking_id: 'b1', traveler_user_id: 'u1', experience_id: 'e1', guide_id: 'g1',
      rating: 5, body: 'Loved it!',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })

  it('translates a unique-violation into the ALREADY_REVIEWED key (ReviewForm maps this to t.alreadyReviewed, never literal English)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    insertMock.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } })
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 4, body: '' })
    expect(result).toEqual({ ok: false, errors: { form: ['ALREADY_REVIEWED'] } })
  })

  it('translates any other DB rejection (e.g. RLS check failing) into the NOT_ELIGIBLE key (ReviewForm maps this to t.genericError)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    insertMock.mockResolvedValueOnce({ error: { code: '42501', message: 'new row violates row-level security policy' } })
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 4, body: '' })
    expect(result).toEqual({ ok: false, errors: { form: ['NOT_ELIGIBLE'] } })
  })
})
