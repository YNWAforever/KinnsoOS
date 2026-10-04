import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ article: null as unknown }))

vi.mock('@supabase/supabase-js', () => {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: state.article, error: null }),
    then: (onF: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: state.article, error: null }).then(onF),
  }
  return { createClient: () => ({ from: () => builder }) }
})

import { getArticleByUrl } from '@/lib/articles/queries'

const baseArticle = {
  id: 'a1', url: 'kyoto-tea', category: 'destinations',
  article_translations: [
    { locale: 'en', title: 'Kyoto Tea (EN)', content: [], summary: null, meta_title: null, meta_description: null, og_image: null, faq_title: null },
    { locale: 'ja', title: 'Kyoto Tea (JA)', content: [], summary: null, meta_title: null, meta_description: null, og_image: null, faq_title: null },
  ],
}

beforeEach(() => { state.article = JSON.parse(JSON.stringify(baseArticle)) })

describe('article translation fallback', () => {
  it('returns the exact locale when present', async () => {
    const a = await getArticleByUrl('kyoto-tea', 'ja')
    expect(a?.translation?.locale).toBe('ja')
  })

  it('falls back to en when the requested locale is missing', async () => {
    const a = await getArticleByUrl('kyoto-tea', 'ko')
    expect(a?.translation?.locale).toBe('en')
  })

  it('falls back to the first available when neither requested nor en exists', async () => {
    state.article = { ...baseArticle, article_translations: [baseArticle.article_translations[1]] }
    const a = await getArticleByUrl('kyoto-tea', 'ko')
    expect(a?.translation?.locale).toBe('ja')
  })
})
