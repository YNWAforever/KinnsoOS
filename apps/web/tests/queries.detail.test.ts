import { describe, it, expect } from 'vitest'
import {
  getArticleDetail, searchArticles, getIndexableArticleLocales,
  getIndexableCategoryLocales, getYouMayLike,
  getPublishedForSitemap, getStaticArticleParams,
} from '@/lib/articles/queries'

describe('article queries', () => {
  it('getArticleDetail returns article + locale translation + faqs + author', async () => {
    const a = await getArticleDetail('dining', 'ramen-guide', 'en')
    expect(a?.url).toBe('ramen-guide')
    expect(a?.translation?.title).toBe('Best Ramen in Tokyo')
    expect(a?.faqs.length).toBe(2)
    expect(a?.faqs[0].question).toBe('Is ramen cheap?')   // higher weight first
    expect(a?.author?.name).toBe('KINNSO Editorial')
  })
  it('getArticleDetail 404s on category mismatch and unpublished fixtures', async () => {
    expect(await getArticleDetail('shopping', 'ramen-guide', 'en')).toBeNull()  // wrong category
    expect(await getArticleDetail('shopping', 'draft-article', 'en')).toBeNull() // RLS-hidden
    expect(await getArticleDetail('dining', 'pub-article', 'en')).toBeNull()
    expect(await getArticleDetail('dining', 'sushi-guide', 'en')).toBeNull()
    expect(await getArticleDetail('dining', 'cafe-guide', 'en')).toBeNull()
    expect(await getArticleDetail('shopping', 'mall-coupon', 'en')).toBeNull()
    expect(await getArticleDetail('destinations', 'expired-article', 'en')).toBeNull()
  })
  it('returns only genuine quality-passing locales for article and category SEO', async () => {
    expect(await getIndexableArticleLocales('ramen-guide')).toEqual(['en', 'zh-hk'])
    expect(await getIndexableCategoryLocales('dining')).toEqual(['en', 'zh-hk'])
  })
  it('getYouMayLike excludes unpublished same-category fixtures', async () => {
    const list = await getYouMayLike('00000000-0000-0000-0000-0000000000a1', 'en', 5)
    const urls = list.map((r) => r.url)
    expect(urls).not.toContain('ramen-guide')
    expect(urls).not.toContain('sushi-guide')
    expect(urls).not.toContain('cafe-guide')
  })
  it('searchArticles paginates with total', async () => {
    const r = await searchArticles({ locale: 'en', category: 'dining', page: 1, perPage: 2 })
    expect(r.items.map((item) => item.url)).toEqual(['ramen-guide'])
    expect(r.total).toBe(1)
  })
  it('uses the same locale decisions for sitemap and static params', async () => {
    const sitemapRows = await getPublishedForSitemap()
    const ramen = sitemapRows.find((row) => row.url === 'ramen-guide')
    expect(ramen?.locales).toEqual(['en', 'zh-hk'])
    expect(sitemapRows.every((row) => row.locales.length > 0)).toBe(true)

    const params = await getStaticArticleParams()
    expect(params).toContainEqual({
      locale: 'en',
      category: 'dining',
      url: 'ramen-guide',
    })
    expect(params.some((param) => param.url === 'sushi-guide')).toBe(false)
  })
})
