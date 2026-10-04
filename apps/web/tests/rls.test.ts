import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

describe('articles RLS', () => {
  it('anon sees only published, in-window, non-deleted articles', async () => {
    const { data, error } = await anon.from('articles').select('slug')
    expect(error).toBeNull()
    const slugs = (data ?? []).map((r) => r.slug)
    expect(slugs).toContain('ramen-guide')
    expect(slugs).not.toContain('pub-article')
    expect(slugs).not.toContain('draft-article')   // unpublished -> RLS-hidden
    expect(slugs).not.toContain('expired-article') // end_at in the past -> RLS-hidden
    expect(slugs).not.toContain('sushi-guide')
    expect(slugs).not.toContain('cafe-guide')
    expect(slugs).not.toContain('mall-coupon')
  })
})
