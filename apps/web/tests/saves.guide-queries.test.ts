// apps/web/tests/saves.guide-queries.test.ts
import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@supabase/supabase-js', () => ({}))

import { listSavedGuides, isGuideSaved } from '@/lib/saves/guide-queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('listSavedGuides', () => {
  it('maps the guide_saves -> guides embed to real Guide objects, dropping rows with no joinable guide', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            guide_id: 'g1',
            guides: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', city: 'Kyoto', cover_url: 'https://x/kyoto.jpg', saves_count: 6, creator_handle: 'teafan' },
          },
          { guide_id: 'g2', guides: null },
        ],
        error: null,
      }),
    )

    const rows = await listSavedGuides(supabaseMock as never, 'traveler-1')

    expect(rows).toEqual([
      { guideId: 'g1', guide: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', city: 'Kyoto', cover: 'https://x/kyoto.jpg', saves: 6, creatorHandle: 'teafan' } },
    ])
  })

  it('throws instead of swallowing a Supabase error', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: new Error('boom') }))
    await expect(listSavedGuides(supabaseMock as never, 'traveler-1')).rejects.toThrow('boom')
  })
})

describe('isGuideSaved', () => {
  it('returns true when a row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: { id: 's1' }, error: null }))
    expect(await isGuideSaved(supabaseMock as never, 'g1', 'traveler-1')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: null }))
    expect(await isGuideSaved(supabaseMock as never, 'g1', 'traveler-1')).toBe(false)
  })
})
