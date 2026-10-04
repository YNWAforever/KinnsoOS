import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyPostBundle, UpsertPayload } from '../src/types'
import { legacyPost } from './fixtures/legacyPost'

const state = vi.hoisted(() => ({
  bundles: new Map<number, LegacyPostBundle>(),
  ids: [] as number[],
  upserts: [] as Array<UpsertPayload & { warnings?: unknown[] }>,
  deletes: [] as number[],
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('../src/reader', () => ({
  LegacyReader: class {
    async fetchPostBundle(id: number) { return state.bundles.get(id) ?? null }
    async allPostIds(afterId: number) {
      if (afterId > 0) return []
      return state.ids
    }
    async close() {}
  },
}))
vi.mock('../src/upserter', () => ({
  Upserter: class {
    async upsert(payload: UpsertPayload & { warnings?: unknown[] }) {
      state.upserts.push(payload)
      return { skipped: false }
    }
    async syncDelete(legacyPostId: number) {
      state.deletes.push(legacyPostId)
    }
  },
}))

import { makeSync } from '../src/sync'

const cfg = {
  legacy: { host: 'unused', port: 3306, database: 'unused', user: 'unused', password: 'unused' },
  supabaseUrl: 'http://unused.local',
  serviceRoleKey: 'unused',
  cdnBase: 'https://cdn.x',
  legacyTimezone: 'UTC',
}

describe('mixed publication sync', () => {
  beforeEach(() => {
    state.bundles.clear()
    state.ids.length = 0
    state.upserts.length = 0
    state.deletes.length = 0
  })

  it('backfills an invalid article with warnings and continues to the next valid article', async () => {
    const invalid = structuredClone(legacyPost)
    invalid.post.id = 900011
    invalid.post.slug = 'invalid-guide'
    invalid.translations = invalid.translations.map((translation) => translation.locale === 'en'
      ? { ...translation, content: JSON.stringify([{ type: 'text', content: '<p>Too short</p>' }]) }
      : translation)
    const valid = structuredClone(legacyPost)
    valid.post.id = 900012
    valid.post.slug = 'valid-guide'
    state.bundles.set(invalid.post.id, invalid)
    state.bundles.set(valid.post.id, valid)
    state.ids.push(invalid.post.id, valid.post.id)

    const sync = makeSync(cfg)
    const result = await sync.backfill()

    expect(result).toEqual({ total: 2, skipped: 0, warnings: 2 })
    expect(state.upserts[0]!.warnings).toContainEqual(expect.objectContaining({
      articleSlug: 'invalid-guide',
      locale: 'en',
      code: 'translation_too_shallow',
    }))
    expect(state.upserts).toHaveLength(2)
    expect(state.upserts[0]!.article.published_at).toBeNull()
    expect(state.upserts[0]!.translations).toHaveLength(2)
    expect(state.upserts[1]!.article.slug).toBe('valid-guide')
    expect(state.upserts[1]!.article.published_at).not.toBeNull()
    expect(state.upserts[1]!.warnings).toEqual([])
  })
})

/**
 * The legacy `deleted` webhook is delivered by a ShouldQueue job with HTTP retries, so
 * the same event can be replayed minutes later, or arrive after the post was restored.
 * syncOne must therefore decide liveness from MySQL, never from the caller's claim.
 */
describe('syncOne with deleteIntent (deleted webhook)', () => {
  beforeEach(() => {
    state.bundles.clear()
    state.ids.length = 0
    state.upserts.length = 0
    state.deletes.length = 0
  })

  it('upserts instead of deleting when the post is still live in MySQL', async () => {
    const live = structuredClone(legacyPost)
    state.bundles.set(live.post.id, live)

    const result = await makeSync(cfg).syncOne(live.post.id, { deleteIntent: true })

    expect(result).toMatchObject({ ok: true, skipped: false })
    expect(state.deletes).toEqual([])
    expect(state.upserts).toHaveLength(1)
  })

  it('deletes when MySQL reports the post soft-deleted, regardless of the event', async () => {
    const removed = structuredClone(legacyPost)
    removed.post.deleted_at = '2026-07-01 00:00:00'
    state.bundles.set(removed.post.id, removed)

    // No deleteIntent: liveness alone is enough to propagate the removal.
    expect(await makeSync(cfg).syncOne(removed.post.id)).toEqual({ ok: true, deleted: true })
    expect(state.deletes).toEqual([removed.post.id])
    expect(state.upserts).toEqual([])
  })

  it('propagates a HARD delete (row gone) only when the caller signals delete intent', async () => {
    // A missing row is ambiguous: for an admin re-sync of a bad id it is "not found",
    // but for a `deleted` event it is the hard delete itself and must reach Supabase.
    expect(await makeSync(cfg).syncOne(404404)).toEqual({ ok: false, reason: 'not_found' })
    expect(state.deletes).toEqual([])

    expect(await makeSync(cfg).syncOne(404404, { deleteIntent: true })).toEqual({ ok: true, deleted: true })
    expect(state.deletes).toEqual([404404])
  })
})
