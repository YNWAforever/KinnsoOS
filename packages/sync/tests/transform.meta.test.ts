import { describe, it, expect } from 'vitest'
import { parseMetaTags, resolveMetaDescription } from '../src/transform/meta'

describe('parseMetaTags', () => {
  it('reads both key variants', () => {
    expect(parseMetaTags(JSON.stringify({ 'og:title': 'X', meta_description: 'D' }))).toMatchObject({ ogTitle: 'X', metaDescription: 'D' })
    expect(parseMetaTags(null)).toEqual({})
    expect(parseMetaTags('garbage')).toEqual({})
  })
})

describe('resolveMetaDescription', () => {
  const zhHk = '香港描述'
  it('zh-hk keeps stored value', () => {
    expect(resolveMetaDescription('zh-hk', zhHk, zhHk, 'summary')).toBe(zhHk)
  })
  it('non-zh-hk falls back to summary when value is empty or equals zh-hk (the leak)', () => {
    expect(resolveMetaDescription('en', zhHk, zhHk, 'EN summary')).toBe('EN summary')
    expect(resolveMetaDescription('en', '', zhHk, 'EN summary')).toBe('EN summary')
    expect(resolveMetaDescription('en', 'genuine EN', zhHk, 'EN summary')).toBe('genuine EN')
  })
})
