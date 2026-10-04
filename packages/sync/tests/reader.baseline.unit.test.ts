import { describe, it, expect, vi } from 'vitest'
import { LegacyReader } from '../src/reader'

/**
 * Fake mysql2 pool. Records every (sql, params) pair so the tests can assert the
 * SQL contract — named placeholders, join keys, keyset pagination — without a DB.
 * The real reader test (reader.contract.test.ts) is describe.skip unless
 * LEGACY_DB_HOST is set, so these are the only reader assertions that run in CI.
 */
function fakeReader(rowsFor: (sql: string) => unknown[]) {
  const calls: Array<{ sql: string; params: Record<string, unknown> }> = []
  const reader = new LegacyReader({ host: 'h', user: 'u', password: 'p', database: 'd' } as never)
  // Replace the pool the constructor built; no connection is ever opened.
  ;(reader as unknown as { pool: unknown }).pool = {
    query: vi.fn(async (sql: string, params: Record<string, unknown>) => {
      calls.push({ sql, params })
      return [rowsFor(sql), []]
    }),
    end: vi.fn(),
  }
  return { reader, calls }
}

const sqlOf = (calls: Array<{ sql: string }>, i = 0) => calls[i].sql.replace(/\s+/g, ' ').trim()

describe('livePostCount', () => {
  it('counts exactly the isPostLive set, so a short scan is detectable', async () => {
    const { reader, calls } = fakeReader(() => [{ n: 1234 }])
    expect(await reader.livePostCount()).toBe(1234)

    const sql = sqlOf(calls)
    expect(sql).toContain('from posts')
    // Must mirror allPostIds' predicate exactly or the tripwire fires on a phantom gap.
    expect(sql).toContain('deleted_at is null')
    expect(sql).toContain('published_at is not null')
  })

  it('reports zero as zero rather than throwing, so the caller decides what empty means', async () => {
    const { reader } = fakeReader(() => [{ n: 0 }])
    expect(await reader.livePostCount()).toBe(0)
  })
})

describe('legacyTranslationCeiling', () => {
  it('groups visible translations by locale using the post_id join key', async () => {
    const { reader, calls } = fakeReader(() => [
      { locale: 'en', n: 10 },
      { locale: 'zh-hk', n: 7 },
    ])
    expect(await reader.legacyTranslationCeiling()).toEqual({ en: 10, 'zh-hk': 7 })

    const sql = sqlOf(calls)
    // post_translations joins on post_id; post_category_weights joins on post_slug.
    // Getting this backwards silently returns nothing.
    expect(sql).toContain('post_translations')
    expect(sql).toContain('on p.id = pt.post_id')
    expect(sql).toContain('group by pt.locale')
  })

  it('filters deleted translations in SQL, which fetchPostBundle does not', async () => {
    // fetchPostBundle selects post_translations.deleted_at and filters it in the
    // transform instead, so its SELECT is NOT a safe template to copy here.
    const { reader, calls } = fakeReader(() => [])
    await reader.legacyTranslationCeiling()
    expect(sqlOf(calls)).toContain('pt.deleted_at is null')
  })
})

describe('sampleNonLivePostIds', () => {
  it('selects the negation of isPostLive, bounded, with a named placeholder', async () => {
    const { reader, calls } = fakeReader(() => [{ id: 9 }, { id: 8 }])
    expect(await reader.sampleNonLivePostIds(25)).toEqual([9, 8])

    expect(sqlOf(calls)).toContain('deleted_at is not null or published_at is null')
    expect(sqlOf(calls)).toContain('limit :limit')
    expect(calls[0].params).toEqual({ limit: 25 })
  })
})

describe('SQL parameterization', () => {
  it('never interpolates a value into the SQL text', async () => {
    const { reader, calls } = fakeReader(() => [])
    await reader.livePostCount()
    await reader.legacyTranslationCeiling()
    await reader.sampleNonLivePostIds(25)
    for (const { sql } of calls) {
      // No template holes and no bare numbers spliced in place of a placeholder.
      expect(sql).not.toMatch(/\$\{/)
      expect(sql).not.toMatch(/limit\s+\d+/)
    }
  })
})

describe('streamPostBundles', () => {
  it('pages by keyset on id and yields every live bundle without new SQL', async () => {
    // Two pages then empty, matching allPostIds' contract.
    let page = 0
    const { reader, calls } = fakeReader((sql) => {
      if (sql.includes('select id from posts where id >')) {
        page++
        if (page === 1) return [{ id: 1 }, { id: 2 }]
        if (page === 2) return [{ id: 5 }]
        return []
      }
      if (sql.includes('from posts where id = :id')) return [{ id: 0, slug: 's', authors: '' }]
      return []
    })

    const seen: number[] = []
    for await (const bundle of reader.streamPostBundles({ pageSize: 2 })) seen.push(bundle.post.id)

    expect(seen).toHaveLength(3)
    const pageCalls = calls.filter((c) => c.sql.includes('select id from posts where id >'))
    // Keyset, not OFFSET: each page resumes after the previous page's last id.
    expect(pageCalls.map((c) => c.params.afterId)).toEqual([0, 2, 5])
    expect(pageCalls.every((c) => c.params.limit === 2)).toBe(true)
    expect(calls.some((c) => /offset/i.test(c.sql))).toBe(false)
  })

  it('skips an id whose post row vanished mid-scan rather than yielding a hole', async () => {
    let page = 0
    const { reader } = fakeReader((sql) => {
      if (sql.includes('select id from posts where id >')) {
        page++
        return page === 1 ? [{ id: 1 }] : []
      }
      return [] // fetchPostBundle finds nothing -> null
    })

    const seen = []
    for await (const bundle of reader.streamPostBundles()) seen.push(bundle)
    expect(seen).toEqual([])
  })
})
