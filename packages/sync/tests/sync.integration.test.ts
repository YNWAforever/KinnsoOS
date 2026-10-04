import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { transformPost } from '../src/transform'
import { Upserter } from '../src/upserter'
import { legacyPost } from './fixtures/legacyPost'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const run = url && key ? describe : describe.skip
// Use placeholder values when env vars absent so createClient doesn't throw at module load;
// the describe.skip guard ensures no tests actually execute against the placeholder.
const svc = createClient(url ?? 'http://localhost:54321', key ?? 'placeholder-key')
const LEGACY_ID = 900001

run('sync integration', () => {
  // Cleanup deletes by the fixture's OWN identifiers, which must stay DISJOINT from
  // supabase/seed.sql (read by the web suite). turbo runs web#test and sync#test in
  // parallel against the same local DB, so deleting a slug the seed also uses would yank
  // it out from under a concurrent web read — that was the queries.detail "Jane Doe" flake.
  afterAll(async () => {
    await svc.from('articles').delete().eq('legacy_post_id', LEGACY_ID) // cascades children
    await svc.from('article_authors').delete().eq('slug', 'best-ramen-author')
    await svc.from('article_tags').delete().eq('slug', 'ramen')
  })

  it('upserts an article with translations, faqs, tags, map (idempotent)', async () => {
    const up = new Upserter(svc as any, 'https://cdn.x')
    const payload = transformPost(legacyPost, 'https://cdn.x')
    expect((await up.upsert(payload)).skipped).toBe(false)
    // Second run must be a real no-op. This asserts against the LIVE PostgREST timestamp
    // format (`+00:00`, no milliseconds), which is the only place the skip's timestamp
    // comparison is exercised end to end.
    expect((await up.upsert(payload)).skipped).toBe(true)

    const { data: a } = await svc.from('articles').select('id, category, views, source_hash').eq('legacy_post_id', LEGACY_ID).single()
    expect(a!.category).toBe('dining')
    const { data: tr } = await svc.from('article_translations').select('locale').eq('article_id', a!.id)
    expect(tr!.map((r) => r.locale).sort()).toEqual(['en', 'zh-hk'])
    const { count: faqCount } = await svc.from('article_faqs').select('*', { count: 'exact', head: true }).eq('article_id', a!.id)
    expect(faqCount).toBe(3)
    const { count: mapCount } = await svc.from('article_tag_map').select('*', { count: 'exact', head: true }).eq('article_id', a!.id)
    expect(mapCount).toBe(1) // llm1-hotel skipped
  })

  it('does not overwrite views on re-sync, and soft-delete propagates', async () => {
    const up = new Upserter(svc as any, 'https://cdn.x')
    await svc.from('articles').update({ views: 9999 }).eq('legacy_post_id', LEGACY_ID)
    await up.upsert(transformPost({ ...legacyPost, post: { ...legacyPost.post, edit_at: '2099-01-01 00:00:00' } }, 'https://cdn.x'))
    const { data: a } = await svc.from('articles').select('views').eq('legacy_post_id', LEGACY_ID).single()
    expect(a!.views).toBe(9999) // views seed-only

    await up.syncDelete(LEGACY_ID)
    const { data: d } = await svc.from('articles').select('deleted_at').eq('legacy_post_id', LEGACY_ID).single()
    expect(d!.deleted_at).not.toBeNull()
  })
})
