const hasRealRating = (
  rating: { average: number; count: number } | undefined,
): rating is { average: number; count: number } =>
  Boolean(
    rating &&
    Number.isFinite(rating.average) &&
    Number.isFinite(rating.count) &&
    rating.count > 0,
  )
export interface ArticleLdInput {
  headline: string; description: string; url: string; images: string[]
  publishedAt: string | null; modifiedAt: string | null; authorName: string | null; locale: string
  rating?: { average: number; count: number }
}

export function articleJsonLd(i: ArticleLdInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: i.headline, description: i.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': i.url },
    image: i.images, inLanguage: i.locale,
    datePublished: i.publishedAt ?? undefined,
    dateModified: i.modifiedAt ?? i.publishedAt ?? undefined,   // <-- the fix: never omit dateModified
    publisher: { '@type': 'Organization', name: 'KINNSO' },
  }
  if (i.authorName) ld.author = { '@type': 'Person', name: i.authorName }
  if (hasRealRating(i.rating)) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: i.rating.average, reviewCount: i.rating.count }
  return ld
}

export function faqJsonLd(
  faqs: Array<{ question: string; answer: string }>,
): Record<string, unknown> | null {
  const visible = faqs.flatMap((faq) => {
    const question = faq.question.trim()
    const answer = faq.answer.trim()
    return question && answer ? [{ question, answer }] : []
  })
  if (visible.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: visible.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type': 'ListItem', position: idx + 1, name: it.name, item: it.url,
    })),
  }
}

export function itemListJsonLd(i: {
  name: string
  items: Array<{ name: string; url: string }>
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: i.name,
    numberOfItems: i.items.length,
    itemListElement: i.items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, url: item.url,
    })),
  }
}

export function organizationJsonLd(i: { url: string; logo: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: 'KINNSO', url: i.url, logo: i.logo,
  }
}

export function websiteJsonLd(i: { url: string; locale: string; searchUrlTemplate: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: 'KINNSO', url: i.url, inLanguage: i.locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: i.searchUrlTemplate },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function creatorProfileJsonLd(i: {
  name: string; handle: string; url: string; bio: string; niches: string[]
}): Record<string, unknown> {
  const person: Record<string, unknown> = {
    '@type': 'Person', name: i.name, alternateName: `@${i.handle}`, url: i.url,
  }
  if (i.bio) person.description = i.bio
  if (i.niches.length) person.knowsAbout = i.niches
  return {
    '@context': 'https://schema.org', '@type': 'ProfilePage',
    mainEntity: person,
  }
}

export function merchantProfileJsonLd(i: {
  name: string; url: string; tagline: string | null; city: string | null
}): Record<string, unknown> {
  const org: Record<string, unknown> = {
    '@type': 'Organization', name: i.name, url: i.url,
  }
  if (i.tagline) org.description = i.tagline
  if (i.city) org.address = { '@type': 'PostalAddress', addressLocality: i.city }
  return {
    '@context': 'https://schema.org', '@type': 'ProfilePage',
    mainEntity: org,
  }
}

export function experienceOfferJsonLd(i: {
  name: string
  description: string
  url: string
  image: string | null
  priceAmount: number
  currency: string
  available: boolean
  rating?: { average: number; count: number }
}): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: i.name,
    description: i.description,
    offers: {
      '@type': 'Offer',
      url: i.url,
      priceCurrency: i.currency,
      price: i.priceAmount,
      availability: i.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  }
  if (i.image) ld.image = i.image
  if (hasRealRating(i.rating)) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: i.rating.average,
      reviewCount: i.rating.count,
    }
  }
  return ld
}

export function sessionEventJsonLd(i: {
  name: string; description: string; url: string
  startDate: string
  status: 'scheduled' | 'live' | 'ended' | 'cancelled'
  embedUrl: string | null
  hostName: string | null
}): Record<string, unknown> {
  // schema.org has no "ended"/"live" EventStatus value — a session that happened as
  // scheduled (live or ended) is still EventScheduled; only an explicit cancellation
  // gets its own value.
  const eventStatus = i.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled'
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Event',
    name: i.name, description: i.description, url: i.url,
    startDate: i.startDate,
    eventStatus,
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: i.embedUrl ?? i.url },
  }
  if (i.hostName) ld.performer = { '@type': 'Person', name: i.hostName }
  return ld
}
