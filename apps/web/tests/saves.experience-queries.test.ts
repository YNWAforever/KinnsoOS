import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@supabase/supabase-js', () => ({}))

import { listSavedExperiences, isExperienceSaved } from '@/lib/saves/experience-queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('listSavedExperiences', () => {
  it('maps the experience_saves -> experiences embed, dropping rows with no joinable experience', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            experience_id: 'e1',
            experiences: { slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', price_amount: 480, currency: 'HKD', cover_url: null, saves_count: 3 },
          },
          { experience_id: 'e2', experiences: null },
        ],
        error: null,
      }),
    )

    const rows = await listSavedExperiences(supabaseMock as never, 'traveler-1')

    expect(rows).toEqual([
      { experienceId: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null, savesCount: 3 },
    ])
  })

  it('throws instead of swallowing a Supabase error', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: new Error('boom') }))
    await expect(listSavedExperiences(supabaseMock as never, 'traveler-1')).rejects.toThrow('boom')
  })
})

describe('isExperienceSaved', () => {
  it('returns true when a row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: { id: 's1' }, error: null }))
    expect(await isExperienceSaved(supabaseMock as never, 'e1', 'traveler-1')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: null }))
    expect(await isExperienceSaved(supabaseMock as never, 'e1', 'traveler-1')).toBe(false)
  })
})
