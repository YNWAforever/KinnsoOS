import { describe, expect, it, vi } from 'vitest'

/**
 * PostgREST answers an unranged SELECT with a 200 and a body truncated to `db-max-rows`
 * (1000 on Supabase). For a parity gate that is silent corruption: the baseline every
 * check is measured against would be capped, and the run would still report PASS. These
 * tests drive a fake PostgREST that enforces the same cap.
 */
const PAGE_SIZE = 1000

const state = vi.hoisted(() => ({
  rows: new Map<string, Array<Record<string, unknown>>>(),
  queries: [] as Array<{ table: string; order: string | null; range: [number, number] | null }>,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const q = { table, order: null as string | null, range: null as [number, number] | null }
      state.queries.push(q)
      const builder = {
        select: () => builder,
        order: (col: string) => { q.order = col; return builder },
        range: (from: number, to: number) => { q.range = [from, to]; return builder },
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
          const all = state.rows.get(table) ?? []
          // A total order is required for stable paging; refuse to fake one without it.
          const ordered = q.order ? [...all].sort((a, b) => String(a[q.order!]).localeCompare(String(b[q.order!]))) : all
          const [from, to] = q.range ?? [0, PAGE_SIZE - 1]
          const capped = Math.min(to, from + PAGE_SIZE - 1)
          return Promise.resolve({ data: ordered.slice(from, capped + 1), error: null }).then(onF, onR)
        },
      }
      return builder
    },
  }),
}))

const { createNewStackSource } = await import('../src/sources/newstack')

const source = () => createNewStackSource({
  baseUrl: 'https://live.test',
  supabaseUrl: 'https://db.test',
  supabaseAnonKey: 'anon',
})

function seed(table: string, rows: Array<Record<string, unknown>>) {
  state.rows.clear()
  state.queries.length = 0
  state.rows.set(table, rows)
}

describe('newstack paging', () => {
  it('reads every article past the 1000-row cap instead of silently truncating', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({
      url: `article-${String(i).padStart(5, '0')}`,
      category: 'dining',
      is_coupon: false,
      article_translations: [{ locale: 'en' }],
    }))
    seed('articles', rows)

    const articles = await source().publishedArticles()

    expect(articles).toHaveLength(2345)
    expect(articles[0]!.url).toBe('article-00000')
    expect(articles.at(-1)!.url).toBe('article-02344')
    // 3 requests: two full pages then a short one, which is what ends the loop.
    expect(state.queries.map((q) => q.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('orders by a unique column so successive ranges cannot overlap or skip rows', async () => {
    seed('articles', [{ url: 'a', category: 'dining', is_coupon: false, article_translations: [] }])

    await source().publishedArticles()

    expect(state.queries.map((q) => q.order)).toEqual(['url'])
  })

  it('counts locales across the whole set, not just the first page', async () => {
    seed('articles', Array.from({ length: 1500 }, (_, i) => ({
      url: `article-${String(i).padStart(5, '0')}`,
      category: 'dining',
      is_coupon: false,
      article_translations: i % 2 === 0 ? [{ locale: 'en' }, { locale: 'zh-hk' }] : [{ locale: 'en' }],
    })))

    expect(await source().localeCounts()).toEqual({ en: 1500, 'zh-hk': 750 })
  })

  it('pages seo_redirects too', async () => {
    seed('seo_redirects', Array.from({ length: 1200 }, (_, i) => ({
      from_path: `/old-${String(i).padStart(5, '0')}`,
      to_path: `/new-${i}`,
    })))

    const redirects = await source().seoRedirects()

    expect(redirects).toHaveLength(1200)
    expect(state.queries.map((q) => q.order)).toEqual(['from_path', 'from_path'])
  })

  it('stops after one extra empty request when the last page is exactly full', async () => {
    seed('articles', Array.from({ length: 2000 }, (_, i) => ({
      url: `article-${String(i).padStart(5, '0')}`,
      category: 'dining',
      is_coupon: false,
      article_translations: [],
    })))

    expect(await source().publishedArticles()).toHaveLength(2000)
    expect(state.queries).toHaveLength(3)
  })
})
