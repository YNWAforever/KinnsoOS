import { describe, it, expect } from 'vitest'
import { transformTags } from '../src/transform/tags'
import { transformAuthors } from '../src/transform/authors'
import { transformFaqs } from '../src/transform/faqs'
import { legacyPost } from './fixtures/legacyPost'

describe('transformTags', () => {
  it('skips llm1-% tags; emits tag rows + translations + slug list', () => {
    const { tags, tagSlugs } = transformTags(legacyPost.tags)
    expect(tagSlugs).toEqual(['ramen'])
    expect(tags).toHaveLength(1)
    expect(tags[0].tag).toMatchObject({ slug: 'ramen', legacy_tag_id: 11 })
    expect(tags[0].translations.map((t) => t.locale).sort()).toEqual(['en', 'zh-hk'])
  })
})

describe('transformAuthors', () => {
  it('maps legacy author cols to article_authors rows (per slug+locale)', () => {
    const rows = transformAuthors(legacyPost.authors, 'https://cdn.x')
    const en = rows.find((r) => r.slug === 'best-ramen-author' && r.locale === 'en')!
    expect(en).toMatchObject({ name: 'Ramen Editor', title: 'Editor', bio: 'Bio', is_active: true })
    expect(en.avatar).toBe('https://cdn.x/jane.webp')
  })
})

describe('transformFaqs', () => {
  it('emits per-locale faqs ordered by weight desc', () => {
    const rows = transformFaqs(legacyPost.faqs)
    const zh = rows.filter((r) => r.locale === 'zh-hk')
    expect(zh.map((r) => r.question)).toEqual(['幾時營業?', '貴唔貴?'])
    expect(rows.some((r) => r.locale === 'en')).toBe(true)
  })
})
