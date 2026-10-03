import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Uses the service-role key (bypasses RLS, mutates `views`). Supplied in CI
// from `supabase status`; not stored in the committed env. Skips cleanly when
// the key is absent (e.g. local runs against the shared hosted project).
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const d = svcKey ? describe : describe.skip
const svc = createClient(process.env.SUPABASE_URL!, svcKey ?? 'missing')

d('article RPCs', () => {
  it('increment_article_view bumps the counter for a url', async () => {
    const before = await svc.from('articles').select('views').eq('url', 'ramen-guide').single()
    await svc.rpc('increment_article_view', { p_url: 'ramen-guide' })
    const after = await svc.from('articles').select('views').eq('url', 'ramen-guide').single()
    expect(after.data!.views as number).toBe((before.data!.views as number) + 1)
  })

  it('increment_article_view does NOT bump a draft / unpublished article', async () => {
    const before = await svc.from('articles').select('views').eq('url', 'draft-article').single()
    await svc.rpc('increment_article_view', { p_url: 'draft-article' })
    const after = await svc.from('articles').select('views').eq('url', 'draft-article').single()
    expect(after.data!.views as number).toBe(before.data!.views as number)
  })

  it('get_you_may_like returns same-category published articles excluding self', async () => {
    const { data, error } = await svc.rpc('get_you_may_like', {
      p_article_id: '00000000-0000-0000-0000-0000000000a1', p_locale: 'en', p_limit: 5,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const urls = (data ?? []).map((row: { url: string }) => row.url)
    expect(urls).not.toContain('sushi-guide')
    expect(urls).not.toContain('cafe-guide')
  })
})
