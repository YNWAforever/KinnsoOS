import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

describe('search_articles RPC', () => {
  it('lists a category newest-first with a window total_count', async () => {
    const { data, error } = await anon.rpc('search_articles', {
      p_locale: 'en', p_category: 'dining', p_limit: 12, p_offset: 0,
    })
    expect(error).toBeNull()
    const urls = (data ?? []).map((r: any) => r.url)
    expect(urls).toEqual(['ramen-guide'])
    expect(urls).not.toContain('mall-coupon')         // different category
    expect(Number((data ?? [])[0].total_count)).toBe(1)
  })

  it('matches by title FTS and by tag name', async () => {
    const byTitle = await anon.rpc('search_articles', { p_locale: 'en', p_q: 'ramen' })
    expect((byTitle.data ?? []).map((r: any) => r.url)).toContain('ramen-guide')
    const byTag = await anon.rpc('search_articles', { p_locale: 'en', p_q: 'Noodles' })
    expect((byTag.data ?? []).map((r: any) => r.url)).toContain('ramen-guide')
  })

  it('excludes unpublished coupon articles from every locale listing', async () => {
    const en = await anon.rpc('search_articles', { p_locale: 'en', p_category: 'shopping' })
    expect((en.data ?? []).map((r: any) => r.url)).not.toContain('mall-coupon')
    const hk = await anon.rpc('search_articles', { p_locale: 'zh-hk', p_category: 'shopping' })
    expect((hk.data ?? []).map((r: any) => r.url)).not.toContain('mall-coupon')
  })
})
