import { describe, it, expect } from 'vitest'
import { slugify, makeSlug } from '@/lib/guides/slug'

describe('slugify', () => {
  it('lowercases, trims, and hyphenates', () => {
    expect(slugify('  Shibuya Coffee Crawl  ')).toBe('shibuya-coffee-crawl')
  })
  it('strips punctuation and collapses separators', () => {
    expect(slugify('Bangkok in 72 Hours: Rooftops, Markets & Massage')).toBe(
      'bangkok-in-72-hours-rooftops-markets-massage',
    )
  })
  it('falls back to "guide" when the title has no slug characters', () => {
    expect(slugify('!!!')).toBe('guide')
  })
})

describe('makeSlug', () => {
  it('appends the suffix to the slugified title', () => {
    expect(makeSlug('Shibuya Coffee Crawl', 'a1b2c3')).toBe('shibuya-coffee-crawl-a1b2c3')
  })
})
