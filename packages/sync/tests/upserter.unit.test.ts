import { describe, it, expect } from 'vitest'
import { Upserter } from '../src/upserter'
import { isPostLive } from '../src/sync'
import { transformPost } from '../src/transform'
import { legacyPost } from './fixtures/legacyPost'

/**
 * Minimal thenable fake of the supabase-js fluent client. Every chain method returns
 * `this`; terminal awaits resolve to `{ data, error }`. `failOn` injects one failure so
 * we can prove the upserter throws and does NOT advance the watermark on a child failure.
 */
class Q {
  op = 'select'
  constructor(
    public table: string,
    public failOn: { table: string; op: string } | undefined,
    public log: string[],
    public existing: Record<string, unknown> | null,
  ) {}
  select() { return this }
  eq() { return this }
  maybeSingle() { return this.run('select-existing') }
  single() { return this.run(this.op) }
  upsert() { this.op = 'upsert'; return this }
  insert() { this.op = 'insert'; return this }
  update() { this.op = 'update'; return this }
  delete() { this.op = 'delete'; return this }
  then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
    return this.run(this.op).then(onF, onR)
  }
  private run(op: string): Promise<{ data: unknown; error: { message: string } | null }> {
    this.log.push(`${this.table}.${op}`)
    if (op === 'select-existing') return Promise.resolve({ data: this.existing, error: null })
    if (this.failOn && this.failOn.table === this.table && this.failOn.op === op) {
      return Promise.resolve({ data: null, error: { message: 'boom' } })
    }
    if (this.table === 'article_tags') return Promise.resolve({ data: { id: 'tag-1', slug: 'ramen' }, error: null })
    if (this.table === 'articles' && op === 'upsert') return Promise.resolve({ data: { id: 'art-1' }, error: null })
    return Promise.resolve({ data: null, error: null })
  }
}

function fakeDb(options: {
  failOn?: { table: string; op: string }
  existing?: Record<string, unknown> | null
} = {}) {
  const log: string[] = []
  return { db: { from: (t: string) => new Q(t, options.failOn, log, options.existing ?? null) }, log }
}

describe('isPostLive', () => {
  it('treats only non-deleted, published posts as live', () => {
    expect(isPostLive({ published_at: '2026-01-01 00:00:00', deleted_at: null })).toBe(true)
    expect(isPostLive({ published_at: null, deleted_at: null })).toBe(false)
    expect(isPostLive({ published_at: '2026-01-01 00:00:00', deleted_at: '2026-02-01 00:00:00' })).toBe(false)
  })
})

describe('Upserter durability', () => {
  it('throws and does NOT advance the watermark when a child insert fails', async () => {
    const { db, log } = fakeDb({ failOn: { table: 'article_translations', op: 'insert' } })
    const up = new Upserter(db as never, 'https://cdn.x')
    await expect(up.upsert(transformPost(legacyPost, 'https://cdn.x'))).rejects.toThrow(/translations/)
    // The watermark update on `articles` must never run after a failed child write.
    expect(log.filter((l) => l === 'articles.update')).toHaveLength(0)
  })

  it('stamps the watermark (articles.update) LAST, only after children succeed', async () => {
    const { db, log } = fakeDb()
    const up = new Upserter(db as never, 'https://cdn.x')
    const res = await up.upsert(transformPost(legacyPost, 'https://cdn.x'))
    expect(res.skipped).toBe(false)
    expect(log).toContain('articles.update')
    expect(log.indexOf('articles.update')).toBe(log.length - 1)
  })

  it('does not skip when the hash matches but desired publication changes from published to draft', async () => {
    const payload = transformPost(legacyPost, 'https://cdn.x')
    payload.article.published_at = null
    // PostgREST's timestamptz wire format (offset, no milliseconds) — what a real read returns.
    const { db, log } = fakeDb({ existing: {
      id: 'art-1', source_hash: payload.article.source_hash, published_at: '2026-06-01T00:00:00+00:00',
      views: 123, deleted_at: null, source_synced_at: '2026-06-11T00:00:00+00:00',
    } })
    const result = await new Upserter(db as never, 'https://cdn.x').upsert(payload)

    expect(result.skipped).toBe(false)
    expect(log).toContain('articles.upsert')
  })

  it('skips an unchanged published article even though PostgREST and JS format the timestamp differently', async () => {
    // Supabase returns `2026-06-01T00:00:00+00:00`; the transform produces
    // `Date.toISOString()` → `2026-06-01T00:00:00.000Z`. Same instant, different text.
    // A string `===` here made the unchanged-skip unreachable for every published
    // article, so each sync re-ran the child delete+reinsert for no reason.
    const payload = transformPost(legacyPost, 'https://cdn.x')
    expect(payload.article.published_at).toBe('2026-06-01T00:00:00.000Z')
    const { db, log } = fakeDb({ existing: {
      id: 'art-1', source_hash: payload.article.source_hash, published_at: '2026-06-01T00:00:00+00:00',
      views: 123, deleted_at: null, source_synced_at: '2026-06-11T00:00:00+00:00',
    } })
    const result = await new Upserter(db as never, 'https://cdn.x').upsert(payload)

    expect(result.skipped).toBe(true)
    expect(log).toEqual(['articles.select-existing'])
  })

  it('re-syncs (does NOT skip) when the stored timestamp is unparseable', async () => {
    // Fail-safe: Date.parse('garbage') is NaN and NaN === NaN is false, so a value we
    // cannot interpret forces the full write rather than a wrong skip.
    const payload = transformPost(legacyPost, 'https://cdn.x')
    const { db, log } = fakeDb({ existing: {
      id: 'art-1', source_hash: payload.article.source_hash, published_at: 'not-a-timestamp',
      views: 123, deleted_at: null, source_synced_at: '2026-06-11T00:00:00+00:00',
    } })
    const result = await new Upserter(db as never, 'https://cdn.x').upsert(payload)

    expect(result.skipped).toBe(false)
    expect(log).toContain('articles.upsert')
  })

  it('skips when both hash and desired draft publication state match', async () => {
    const payload = transformPost(legacyPost, 'https://cdn.x')
    payload.article.published_at = null
    const { db, log } = fakeDb({ existing: {
      id: 'art-1', source_hash: payload.article.source_hash, published_at: null,
      views: 123, deleted_at: null, source_synced_at: '2026-06-11T00:00:00.000Z',
    } })
    const result = await new Upserter(db as never, 'https://cdn.x').upsert(payload)

    expect(result.skipped).toBe(true)
    expect(log).toEqual(['articles.select-existing'])
  })
})
