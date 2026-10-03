import { describe, it, expect } from 'vitest'
import { articleJsonLd, faqJsonLd, breadcrumbJsonLd, organizationJsonLd, websiteJsonLd, creatorProfileJsonLd, merchantProfileJsonLd, experienceOfferJsonLd } from '@/lib/seo/jsonld'

describe('JSON-LD', () => {
  it('Article includes datePublished AND dateModified (the SEO fix)', () => {
    const ld = articleJsonLd({
      headline: 'Best Ramen', description: 'A guide', url: 'https://www.kinnso.ai/en/articles/dining/ramen-guide',
      images: ['https://cdn.kinnso.ai/a1.jpg'], publishedAt: '2026-06-01T00:00:00Z',
      modifiedAt: '2026-06-10T00:00:00Z', authorName: 'Jane Doe', locale: 'en',
    })
    expect(ld['@type']).toBe('Article')
    expect(ld.datePublished).toBe('2026-06-01T00:00:00Z')
    expect(ld.dateModified).toBe('2026-06-10T00:00:00Z')
    expect(ld.author).toEqual({ '@type': 'Person', name: 'Jane Doe' })
    expect(ld.inLanguage).toBe('en')
  })
  it('dateModified falls back to publishedAt when missing', () => {
    const ld = articleJsonLd({
      headline: 'x', description: 'y', url: 'u', images: [], publishedAt: '2026-06-01T00:00:00Z',
      modifiedAt: null, authorName: null, locale: 'en',
    })
    expect(ld.dateModified).toBe('2026-06-01T00:00:00Z')
    expect(ld.author).toBeUndefined()
  })
  it('filters empty FAQ rows and returns null when none remain', () => {
    const ld = faqJsonLd([
      { question: '  Q1? ', answer: ' A1 ' },
      { question: ' ', answer: 'hidden' },
      { question: 'hidden', answer: '' },
    ])
    expect((ld?.mainEntity as unknown[])).toEqual([{
      '@type': 'Question',
      name: 'Q1?',
      acceptedAnswer: { '@type': 'Answer', text: 'A1' },
    }])
    expect(faqJsonLd([{ question: ' ', answer: ' ' }])).toBeNull()
  })
  it('BreadcrumbList builds positioned items', () => {
    const ld = breadcrumbJsonLd([
      { name: 'Home', url: 'https://x/en' },
      { name: 'Dining', url: 'https://x/en/articles/dining' },
    ])
    expect(ld['@type']).toBe('BreadcrumbList')
    expect((ld.itemListElement as unknown[])[1]).toEqual({
      '@type': 'ListItem', position: 2, name: 'Dining', item: 'https://x/en/articles/dining',
    })
  })

  it('Article includes aggregateRating when a rating is supplied', () => {
    const ld = articleJsonLd({
      headline: 'x', description: 'y', url: 'u', images: [], publishedAt: null,
      modifiedAt: null, authorName: null, locale: 'en', rating: { average: 4.5, count: 12 },
    })
    expect(ld.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 12 })
  })

  it('Article omits aggregateRating entirely when no rating is supplied (never a fake ratingCount: 0)', () => {
    const ld = articleJsonLd({
      headline: 'x', description: 'y', url: 'u', images: [], publishedAt: null,
      modifiedAt: null, authorName: null, locale: 'en',
    })
    expect(ld.aggregateRating).toBeUndefined()
  })
})

describe('organizationJsonLd', () => {
  it('builds a schema.org Organization', () => {
    const o = organizationJsonLd({ url: 'https://www.kinnso.ai', logo: 'https://www.kinnso.ai/icon.png' }) as any
    expect(o['@type']).toBe('Organization')
    expect(o.name).toBe('KINNSO')
    expect(o.url).toBe('https://www.kinnso.ai')
    expect(o.logo).toBe('https://www.kinnso.ai/icon.png')
  })
})

describe('websiteJsonLd', () => {
  it('builds a WebSite with a SearchAction', () => {
    const w = websiteJsonLd({
      url: 'https://www.kinnso.ai/en', locale: 'en',
      searchUrlTemplate: 'https://www.kinnso.ai/en/articles?q={search_term_string}',
    }) as any
    expect(w['@type']).toBe('WebSite')
    expect(w.inLanguage).toBe('en')
    expect(w.potentialAction['@type']).toBe('SearchAction')
    expect(w.potentialAction.target.urlTemplate).toContain('{search_term_string}')
    expect(w.potentialAction['query-input']).toBe('required name=search_term_string')
  })
})

describe('creatorProfileJsonLd', () => {
  it('wraps a Person in a ProfilePage', () => {
    const p = creatorProfileJsonLd({
      name: 'Maya', handle: 'maya', url: 'https://www.kinnso.ai/en/c/maya',
      bio: 'Slow travel', niches: ['Coffee', 'City Walk'],
    }) as any
    expect(p['@type']).toBe('ProfilePage')
    expect(p.mainEntity['@type']).toBe('Person')
    expect(p.mainEntity.name).toBe('Maya')
    expect(p.mainEntity.alternateName).toBe('@maya')
    expect(p.mainEntity.knowsAbout).toEqual(['Coffee', 'City Walk'])
  })
  it('omits empty bio and niches', () => {
    const p = creatorProfileJsonLd({ name: 'Leo', handle: 'leo', url: 'u', bio: '', niches: [] }) as any
    expect(p.mainEntity.description).toBeUndefined()
    expect(p.mainEntity.knowsAbout).toBeUndefined()
  })
})

describe('merchantProfileJsonLd', () => {
  it('wraps an Organization in a ProfilePage', () => {
    const p = merchantProfileJsonLd({
      name: 'Acme Travel', url: 'https://www.kinnso.ai/en/m/acme-travel',
      tagline: 'Boutique tours', city: 'Hong Kong',
    }) as any
    expect(p['@type']).toBe('ProfilePage')
    expect(p.mainEntity['@type']).toBe('Organization')
    expect(p.mainEntity.name).toBe('Acme Travel')
    expect(p.mainEntity.description).toBe('Boutique tours')
    expect(p.mainEntity.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Hong Kong' })
  })
  it('omits empty tagline and city', () => {
    const p = merchantProfileJsonLd({ name: 'Acme', url: 'u', tagline: null, city: null }) as any
    expect(p.mainEntity.description).toBeUndefined()
    expect(p.mainEntity.address).toBeUndefined()
  })
})

describe('experienceOfferJsonLd', () => {
  it('emits major-unit price and InStock only for actual open booking', () => {
    const ld = experienceOfferJsonLd({
      name: 'Tokyo night',
      description: 'Izakaya crawl.',
      url: 'https://x/en/experiences/tokyo-night',
      image: null,
      priceAmount: 12000,
      currency: 'JPY',
      available: true,
    })
    expect(ld.offers).toEqual({
      '@type': 'Offer',
      url: 'https://x/en/experiences/tokyo-night',
      priceCurrency: 'JPY',
      price: 12000,
      availability: 'https://schema.org/InStock',
    })
  })

  it('uses OutOfStock when booking is disabled or availability fails closed', () => {
    const ld = experienceOfferJsonLd({
      name: 'Tokyo night',
      description: 'Izakaya crawl.',
      url: 'https://x/en/experiences/tokyo-night',
      image: null,
      priceAmount: 12000,
      currency: 'JPY',
      available: false,
    })
    expect((ld.offers as { availability: string }).availability).toBe(
      'https://schema.org/OutOfStock',
    )
  })

  it('includes aggregateRating when a rating is supplied', () => {
    const ld = experienceOfferJsonLd({
      name: 'Sunset tour', description: 'Two hours on the harbour.', url: 'https://x/experiences/sunset-tour',
      image: null, priceAmount: 480, currency: 'HKD', available: true, rating: { average: 5, count: 1 },
    })
    expect(ld.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 5, reviewCount: 1 })
  })

  it('omits aggregateRating entirely when no rating is supplied', () => {
    const ld = experienceOfferJsonLd({
      name: 'Sunset tour', description: 'Two hours on the harbour.', url: 'https://x/experiences/sunset-tour',
      image: null, priceAmount: 480, currency: 'HKD', available: true,
    })
    expect(ld.aggregateRating).toBeUndefined()
  })
  it('omits aggregateRating when count is zero', () => {
    const article = articleJsonLd({
      headline: 'x',
      description: 'y',
      url: 'u',
      images: [],
      publishedAt: null,
      modifiedAt: null,
      authorName: null,
      locale: 'en',
      rating: { average: 5, count: 0 },
    })
    const experience = experienceOfferJsonLd({
      name: 'x',
      description: 'y',
      url: 'u',
      image: null,
      priceAmount: 1,
      currency: 'HKD',
      available: true,
      rating: { average: 5, count: 0 },
    })
    expect(article.aggregateRating).toBeUndefined()
    expect(experience.aggregateRating).toBeUndefined()
  })
})
