import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  author: { data: { slug: 'ada' }, error: null } as unknown,
  articles: { data: [], error: null } as unknown,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is', 'not', 'contains', 'order', 'limit']) {
        builder[method] = (...args: unknown[]) => {
          state.calls.push({ table, method, args })
          return builder
        }
      }
      builder.maybeSingle = async () => state.author
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(state.articles).then(resolve)
      return builder
    },
  }),
}))

import { getPublishedArticlesForCreator } from '@/lib/articles/queries'

beforeEach(() => {
  state.calls = []
  state.author = { data: { slug: 'ada' }, error: null }
  state.articles = {
    data: [{
      id: 'a1', url: 'ada-in-hk', category: 'destination', thumbnails: ['cover.jpg'], published_at: '2026-07-01T00:00:00Z',
      article_translations: [{ locale: 'en', title: 'Ada in Hong Kong', summary: 'A precise local guide.' }],
    }],
    error: null,
  }
})

describe('getPublishedArticlesForCreator', () => {
  it('requires the exact active author handle, article membership, publication, deletion, and requested translation gates', async () => {
    await expect(getPublishedArticlesForCreator('ada', 'en')).resolves.toEqual([{
      id: 'a1', url: 'ada-in-hk', category: 'destination', title: 'Ada in Hong Kong', summary: 'A precise local guide.', thumbnail: 'cover.jpg', publishedAt: '2026-07-01T00:00:00Z',
    }])

    expect(state.calls).toContainEqual({ table: 'article_authors', method: 'eq', args: ['slug', 'ada'] })
    expect(state.calls).toContainEqual({ table: 'article_authors', method: 'eq', args: ['locale', 'en'] })
    expect(state.calls).toContainEqual({ table: 'article_authors', method: 'eq', args: ['is_active', true] })
    expect(state.calls).toContainEqual({ table: 'articles', method: 'contains', args: ['authors', ['ada']] })
    expect(state.calls).toContainEqual({ table: 'articles', method: 'is', args: ['deleted_at', null] })
    expect(state.calls).toContainEqual({ table: 'articles', method: 'not', args: ['published_at', 'is', null] })
    expect(state.calls).toContainEqual({ table: 'articles', method: 'eq', args: ['article_translations.locale', 'en'] })
  })
})
