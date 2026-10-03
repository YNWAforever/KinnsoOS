import { describe, it, expect } from 'vitest'
import { transformPost } from '../src/transform'
import { sourceHash } from '../src/transform/article'
import { legacyPost } from './fixtures/legacyPost'

const cdn = 'https://cdn.x'

describe('transformPost', () => {
  const out = transformPost(legacyPost, cdn)

  it('builds the articles spine row', () => {
    expect(out.article).toMatchObject({
      legacy_post_id: 900001, slug: 'best-ramen-tokyo', url: 'best-ramen-tokyo',
      category: 'dining', views: 123,
    })
    expect(out.article.thumbnails).toEqual(['https://cdn.x/a.webp', 'https://cdn.x/b.webp'])
    expect(out.article.regions).toEqual(['jp', 'tokyo'])
    expect(out.article.authors).toEqual(['best-ramen-author', 'ghost-author'])
    expect(out.article.tag_slugs).toEqual(['ramen'])
    expect(typeof out.article.source_hash).toBe('string')
  })

  it('sets is_coupon when the legacy post has offers (drives EN-coupon noindex/search-exclude)', () => {
    expect(transformPost({ ...legacyPost, post: { ...legacyPost.post, offers: 'COUPON10,SALE' } }, cdn).article.is_coupon).toBe(true)
    expect(transformPost({ ...legacyPost, post: { ...legacyPost.post, offers: null } }, cdn).article.is_coupon).toBe(false)
    expect(transformPost({ ...legacyPost, post: { ...legacyPost.post, offers: '' } }, cdn).article.is_coupon).toBe(false)
  })

  it('fans out only present locales; fixes en meta_description leak', () => {
    expect(out.translations.map((t) => t.locale).sort()).toEqual(['en', 'zh-hk'])
    const en = out.translations.find((t) => t.locale === 'en')!
    expect(en.meta_description).toBe(en.summary) // leaked zh-hk value replaced
    const zh = out.translations.find((t) => t.locale === 'zh-hk')!
    expect(zh.meta_description).toBe('香港描述') // kept
    expect(Array.isArray(en.content)).toBe(true)
  })

  it('keeps a compliant requested-published article published', () => {
    expect(out.article.published_at).not.toBeNull()
    expect(out.warnings.filter((warning) => warning.kind === 'publication')).toEqual([])
  })

  it('downgrades the whole article for one bad locale while retaining child rows and structured warnings', () => {
    const translations = legacyPost.translations.map((translation) => translation.locale === 'en'
      ? { ...translation, content: JSON.stringify([{ type: 'text', content: '<p>Too short</p>' }]) }
      : translation)
    const invalid = transformPost({ ...legacyPost, translations }, cdn)

    expect(invalid.article.published_at).toBeNull()
    expect(invalid.translations).toHaveLength(2)
    expect(invalid.authors).toHaveLength(2)
    expect(invalid.warnings).toContainEqual(expect.objectContaining({
      kind: 'publication',
      code: 'translation_too_shallow',
      articleSlug: 'best-ramen-tokyo',
      locale: 'en',
      path: 'translations.en.content',
    }))
  })

  it('downgrades requested publication when every translation was deleted', () => {
    const translations = legacyPost.translations.map((translation) => ({
      ...translation,
      deleted_at: '2026-07-19 00:00:00',
    }))
    const invalid = transformPost({ ...legacyPost, translations }, cdn)

    expect(invalid.article.published_at).toBeNull()
    expect(invalid.translations).toEqual([])
    expect(invalid.warnings.filter((warning) => warning.kind === 'publication')).toEqual([
      expect.objectContaining({ code: 'missing_translation', path: 'translations' }),
      expect.objectContaining({ code: 'invalid_author', path: 'authors' }),
    ])
  })

  it('skips publication validation for a requested draft', () => {
    const draft = transformPost({
      ...legacyPost,
      post: { ...legacyPost.post, published_at: null },
      translations: legacyPost.translations.map((translation) => ({
        ...translation,
        content: JSON.stringify([{ type: 'text', content: '<p>Too short</p>', link: 'http://unsafe.test' }]),
      })),
      authors: [],
    }, cdn)

    expect(draft.article.published_at).toBeNull()
    expect(draft.warnings.filter((warning) => warning.kind === 'publication')).toEqual([])
  })

  it('source_hash is stable for identical input, changes on edit', () => {
    const h1 = sourceHash(legacyPost)
    const edited = { ...legacyPost, post: { ...legacyPost.post, edit_at: '2099-01-01 00:00:00' } }
    expect(sourceHash(edited)).not.toBe(h1)
  })

  it('source_hash is invariant to reader row order (translations/tags/faqs reordered)', () => {
    const base = sourceHash(legacyPost)
    const reordered = {
      ...legacyPost,
      translations: [...legacyPost.translations].reverse(),
      faqs: [...legacyPost.faqs].reverse(),
      authors: [...legacyPost.authors].reverse(),
      categoryWeights: [...legacyPost.categoryWeights].reverse(),
      tags: [...legacyPost.tags].reverse().map((t) => ({ ...t, translations: [...t.translations].reverse() })),
    }
    expect(sourceHash(reordered)).toBe(base)
  })

  it('source_hash does not mutate the input bundle while sorting', () => {
    const before = JSON.stringify(legacyPost)
    sourceHash(legacyPost)
    expect(JSON.stringify(legacyPost)).toBe(before)
  })

  it('rewrites og_image from meta_tags through the CDN', () => {
    const en = out.translations.find((t) => t.locale === 'en')!
    expect(en.og_image).toBe('https://cdn.x/og.webp')
  })

  it('warns on malformed content JSON but NOT on a valid-but-empty array', () => {
    const en = legacyPost.translations.find((t) => t.locale === 'en')!
    const empty = transformPost({ ...legacyPost, translations: [{ ...en, content: '[]' }] }, cdn)
    expect(empty.warnings.some((w) => w.kind === 'content_parse_failed')).toBe(false)
    expect(empty.warnings).toContainEqual(expect.objectContaining({
      code: 'translation_too_shallow', articleSlug: 'best-ramen-tokyo', locale: 'en',
    }))
    const bad = transformPost({ ...legacyPost, translations: [{ ...en, content: 'not json' }] }, cdn)
    expect(bad.warnings).toContainEqual(expect.objectContaining({
      kind: 'content_parse_failed', code: 'content_parse_failed', articleSlug: 'best-ramen-tokyo', locale: 'en',
    }))
  })
})
