import { describe, it, expect, vi } from 'vitest'
import { createNewStackSource, tallyLocaleCounts } from '../src/sources/newstack'

describe('newstack helpers', () => {
  it('tallies per-locale counts from published articles', () => {
    expect(
      tallyLocaleCounts([
        { url: 'a', category: 'dining', isCoupon: false, locales: ['en', 'zh-hk'] },
        { url: 'b', category: 'dining', isCoupon: false, locales: ['en'] },
      ]),
    ).toEqual({ en: 2, 'zh-hk': 1 })
  })

  it('builds absolute fetch URLs from base + path and trims a trailing slash', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const source = createNewStackSource({
      baseUrl: 'https://live.test/',
      supabaseUrl: 'https://db.test',
      supabaseAnonKey: 'anon',
    })
    await source.status('/en/articles/dining/ramen-guide')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://live.test/en/articles/dining/ramen-guide',
      expect.objectContaining({ redirect: 'manual' }),
    )
    vi.unstubAllGlobals()
  })
})
