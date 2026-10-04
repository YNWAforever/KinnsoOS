import { describe, it, expect } from 'vitest'
import { getArticleByUrl } from '@/lib/articles/queries'

describe('getArticleByUrl', () => {
  it('returns a published article with its requested-locale translation', async () => {
    const a = await getArticleByUrl('ramen-guide', 'en')
    expect(a?.url).toBe('ramen-guide')
    expect(a?.translation?.title).toBe('Best Ramen in Tokyo')
  })
  it('returns null for unpublished fixtures', async () => {
    expect(await getArticleByUrl('draft-article', 'en')).toBeNull()
    expect(await getArticleByUrl('pub-article', 'en')).toBeNull()
  })
})
