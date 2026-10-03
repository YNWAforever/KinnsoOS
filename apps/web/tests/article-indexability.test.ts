import { describe, expect, it } from 'vitest'
import {
  MIN_ARTICLE_VISIBLE_CHARACTERS,
  articleVisibleCharacterCount,
  indexableArticleLocales,
  isArticleTranslationIndexable,
  resolveArticleIndexing,
  type ArticleSeoTranslation,
} from '@/lib/seo/article-indexability'

const translation = (
  locale: ArticleSeoTranslation['locale'],
  content: unknown,
  overrides: Partial<ArticleSeoTranslation> = {},
): ArticleSeoTranslation => ({
  locale,
  title: 'A real guide',
  summary: 'A useful summary.',
  metaDescription: null,
  content,
  ...overrides,
})

const textBlock = (content: string) => [
  { id: 'block-1', type: 'text', content: `<p>${content}</p>` },
]

describe('articleVisibleCharacterCount', () => {
  it('strips HTML, entities, and collapsed whitespace before counting Unicode code points', () => {
    expect(articleVisibleCharacterCount(textBlock('你好&amp; 世界  '))).toBe(5)
  })

  it('counts supported visible fields and ignores unknown blocks', () => {
    const content = [
      { id: 'a', type: 'detail-box', title: 'Tea', address: { label: 'Kyoto' } },
      { id: 'b', type: 'multiple-image', images: [{ desc: 'Ceremony' }] },
      { id: 'c', type: 'unknown', content: 'do not count this' },
    ]
    expect(articleVisibleCharacterCount(content)).toBe('Tea Kyoto Ceremony'.length)
  })

  it('fails closed for malformed content', () => {
    expect(articleVisibleCharacterCount('{not json')).toBe(0)
    expect(articleVisibleCharacterCount(null)).toBe(0)
  })
})

describe('isArticleTranslationIndexable', () => {
  it('rejects 299 visible characters and accepts exactly 300 in English and CJK content', () => {
    expect(MIN_ARTICLE_VISIBLE_CHARACTERS).toBe(300)
    expect(isArticleTranslationIndexable(translation('en', textBlock('a'.repeat(299))), false)).toBe(false)
    expect(isArticleTranslationIndexable(translation('en', textBlock('a'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('zh-hk', textBlock('你'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('ja', textBlock('日'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('ko', textBlock('한'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('th', textBlock('ก'.repeat(300))), false)).toBe(true)
  })

  it('requires a title and either summary or meta description', () => {
    const rich = textBlock('a'.repeat(300))
    expect(isArticleTranslationIndexable(translation('en', rich, { title: ' ' }), false)).toBe(false)
    expect(isArticleTranslationIndexable(
      translation('en', rich, { summary: null, metaDescription: 'SEO description' }),
      false,
    )).toBe(true)
    expect(isArticleTranslationIndexable(
      translation('en', rich, { summary: ' ', metaDescription: null }),
      false,
    )).toBe(false)
  })

  it('preserves the existing default-locale coupon noindex policy', () => {
    const rich = textBlock('a'.repeat(300))
    expect(isArticleTranslationIndexable(translation('en', rich), true)).toBe(false)
    expect(isArticleTranslationIndexable(translation('zh-hk', rich), true)).toBe(true)
  })
})

describe('article locale decisions', () => {
  it('orders genuine indexable locales by LOCALES and de-duplicates them', () => {
    const rich = textBlock('a'.repeat(300))
    expect(indexableArticleLocales([
      translation('zh-hk', rich),
      translation('en', rich),
      translation('zh-hk', rich),
      translation('ja', textBlock('short')),
    ], false)).toEqual(['en', 'zh-hk'])
  })

  it('self-canonicalizes a genuine indexable translation', () => {
    expect(resolveArticleIndexing({
      requestedLocale: 'zh-hk',
      resolvedLocale: 'zh-hk',
      indexableLocales: ['en', 'zh-hk'],
    })).toEqual({
      index: true,
      canonicalLocale: 'zh-hk',
      alternateLocales: ['en', 'zh-hk'],
    })
  })

  it('noindexes fallback and thin locales, preferring English then LOCALES order', () => {
    expect(resolveArticleIndexing({
      requestedLocale: 'ja',
      resolvedLocale: 'en',
      indexableLocales: ['en', 'zh-hk'],
    })).toEqual({
      index: false,
      canonicalLocale: 'en',
      alternateLocales: ['en', 'zh-hk'],
    })
    expect(resolveArticleIndexing({
      requestedLocale: 'en',
      resolvedLocale: 'en',
      indexableLocales: ['zh-hk'],
    }).canonicalLocale).toBe('zh-hk')
  })

  it('does not fabricate a canonical or x-default target when no locale is indexable', () => {
    expect(resolveArticleIndexing({
      requestedLocale: 'en',
      resolvedLocale: 'en',
      indexableLocales: [],
    })).toEqual({ index: false, canonicalLocale: null, alternateLocales: [] })
  })
})
