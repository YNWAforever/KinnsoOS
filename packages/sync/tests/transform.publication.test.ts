import { describe, expect, it } from 'vitest'
import type { PublicationInput } from '../src/transform/publication'
import { countLocaleWords, validatePublication } from '../src/transform/publication'

const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ')

function contentWithWords(count = 160) {
  const text = words(count).split(' ')
  return [
    { type: 'text', content: `<p>${text.slice(0, 54).join(' ')}</p>` },
    { type: 'text', content: `<p>${text.slice(54, 107).join(' ')}</p>` },
    { type: 'detail-box', content: `<p>${text.slice(107).join(' ')}</p>` },
  ]
}

function makeValid(): PublicationInput {
  return {
    articleSlug: 'honest-guide',
    authorSlugs: ['trusted-author'],
    translations: [
      { article_id: '', locale: 'en', content: contentWithWords() },
      { article_id: '', locale: 'zh-hk', content: contentWithWords() },
    ],
    authors: [
      { slug: 'trusted-author', locale: 'en', name: 'Trusted Author', is_active: true },
      { slug: 'trusted-author', locale: 'zh-hk', name: '可信作者', is_active: true },
    ],
  }
}

const clone = (input: PublicationInput): PublicationInput => structuredClone(input)

describe('countLocaleWords', () => {
  it('counts locale-segmented visible words', () => {
    expect(countLocaleWords('one two three', 'en')).toBe(3)
  })
})

describe('validatePublication', () => {
  it('accepts a compliant article', () => {
    expect(validatePublication(makeValid()).map((warning) => warning.code)).toEqual([])
  })

  it('rejects a requested publication with no surviving translations', () => {
    const input = clone(makeValid())
    input.translations = []
    const warnings = validatePublication(input)

    expect(warnings.filter((warning) => warning.code === 'missing_translation')).toEqual([
      expect.objectContaining({ articleSlug: 'honest-guide', path: 'translations' }),
    ])
    expect(warnings.filter((warning) => warning.code === 'invalid_author')).toEqual([
      expect.objectContaining({ articleSlug: 'honest-guide', path: 'authors' }),
    ])
    expect(warnings.every((warning) => warning.locale === undefined)).toBe(true)
  })

  it('reports a wholly unresolved author once at article level', () => {
    const input = clone(makeValid())
    input.authorSlugs = ['unknown-author']
    expect(validatePublication(input).filter((warning) => warning.code === 'invalid_author')).toEqual([
      expect.objectContaining({ articleSlug: 'honest-guide', path: 'authors' }),
    ])
  })

  it('rejects a translation with only two nonempty blocks', () => {
    const input = clone(makeValid())
    input.translations[0]!.content = contentWithWords().slice(0, 2)
    expect(validatePublication(input).map((warning) => warning.code)).toContain('translation_too_shallow')
  })

  it('rejects a translation with 149 locale-segmented visible words', () => {
    const input = clone(makeValid())
    input.translations[0]!.content = contentWithWords(149)
    expect(validatePublication(input).map((warning) => warning.code)).toContain('translation_too_short')
  })

  it('excludes nested metadata beneath non-visible keys from word and block counts', () => {
    const input = clone(makeValid())
    input.translations[0]!.content = [
      { type: 'image', image: { captions: [words(160)] } },
      { type: 'text', content: '<p>visible</p>' },
      { type: 'text', content: '<p>also visible</p>' },
    ]
    expect(validatePublication(input).map((warning) => warning.code)).toContain('translation_too_short')
  })

  it('finds a nested insecure outbound link with a stable path', () => {
    const input = clone(makeValid())
    const content = input.translations[0]!.content as Array<Record<string, unknown>>
    content[2]!.address = { label: 'Map', link: 'http://maps.example.net/place' }
    const warnings = validatePublication(input)
    expect(warnings.map((warning) => warning.code)).toContain('invalid_external_link')
    expect(warnings).toContainEqual(expect.objectContaining({
      articleSlug: 'honest-guide',
      locale: 'en',
      path: 'translations.en.content[2].address.link',
      code: 'invalid_external_link',
    }))
  })

  it('finds a reserved example-domain href inside HTML content', () => {
    const input = clone(makeValid())
    const content = input.translations[0]!.content as Array<Record<string, unknown>>
    content[1]!.content = `${content[1]!.content}<a href="https://wanderpack.example.com">Book</a>`
    const warnings = validatePublication(input)
    expect(warnings.map((warning) => warning.code)).toContain('invalid_external_link')
    expect(warnings).toContainEqual(expect.objectContaining({
      locale: 'en',
      path: 'translations.en.content[1].content',
    }))
  })

  it('finds an unquoted HTML href and preserves the containing content path', () => {
    const input = clone(makeValid())
    const content = input.translations[0]!.content as Array<Record<string, unknown>>
    content[1]!.content = `${content[1]!.content}<a href=https://unsafe.example/path>Book</a>`
    const warnings = validatePublication(input)
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'invalid_external_link',
      articleSlug: 'honest-guide',
      locale: 'en',
      path: 'translations.en.content[1].content',
    }))
  })

  it('rejects the Jane Doe placeholder', () => {
    const input = clone(makeValid())
    input.authors[0]!.name = 'Jane Doe'
    expect(validatePublication(input).map((warning) => warning.code)).toContain('invalid_author')
  })

  it('rejects the Jane Doe placeholder with repeated internal whitespace', () => {
    const input = clone(makeValid())
    input.authors[0]!.name = '  Jane \t  Doe  '
    expect(validatePublication(input).map((warning) => warning.code)).toContain('invalid_author')
  })

  it('rejects a missing requested author row', () => {
    const input = clone(makeValid())
    input.authorSlugs = ['unknown-author']
    expect(validatePublication(input).map((warning) => warning.code)).toContain('invalid_author')
  })

  it('reports only the locale missing an otherwise resolved author', () => {
    const input = clone(makeValid())
    input.authors = input.authors.filter((author) => author.locale === 'en')
    expect(validatePublication(input).filter((warning) => warning.code === 'invalid_author')).toEqual([
      expect.objectContaining({
        articleSlug: 'honest-guide',
        locale: 'zh-hk',
        path: 'translations.zh-hk.authors',
      }),
    ])
  })

  it('accepts kinnso-editorial only through an active locale row', () => {
    const input = clone(makeValid())
    input.authorSlugs = ['kinnso-editorial']
    input.authors = [
      { slug: 'kinnso-editorial', locale: 'en', name: 'KINNSO Editorial', is_active: true },
      { slug: 'kinnso-editorial', locale: 'zh-hk', name: 'KINNSO 編輯部', is_active: true },
    ]
    expect(validatePublication(input).map((warning) => warning.code)).toEqual([])
  })

  it('rejects inactive and empty-name author rows', () => {
    const inactive = clone(makeValid())
    inactive.authors[0]!.is_active = false
    expect(validatePublication(inactive).map((warning) => warning.code)).toContain('invalid_author')

    const empty = clone(makeValid())
    empty.authors[0]!.name = '   '
    expect(validatePublication(empty).map((warning) => warning.code)).toContain('invalid_author')
  })
})
