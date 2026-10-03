import { describe, it, expect } from 'vitest'
import { urlSegment, detailPath, publishedPaths } from '../src/url'

describe('url helpers', () => {
  it('maps singular DB category to plural URL segment', () => {
    expect(urlSegment('destination')).toBe('destinations')
    expect(urlSegment('dining')).toBe('dining')
    expect(urlSegment('shopping')).toBe('shopping')
    expect(urlSegment('promotion')).toBeNull()
  })

  it('builds a detail path, or null for an unrouted category', () => {
    expect(detailPath('en', 'dining', 'ramen-guide')).toBe('/en/articles/dining/ramen-guide')
    expect(detailPath('en', 'destination', 'expired-article')).toBe('/en/articles/destinations/expired-article')
    expect(detailPath('en', 'promotion', 'x')).toBeNull()
  })

  it('fans published articles out across their locales, skipping unrouted', () => {
    expect(
      publishedPaths([
        { url: 'ramen-guide', category: 'dining', isCoupon: false, locales: ['en', 'zh-hk'] },
        { url: 'p', category: 'promotion', isCoupon: false, locales: ['en'] },
      ]),
    ).toEqual(['/en/articles/dining/ramen-guide', '/zh-hk/articles/dining/ramen-guide'])
  })
})
