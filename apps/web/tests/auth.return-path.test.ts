import { describe, expect, it } from 'vitest'
import { signInHref } from '@/lib/auth/return-path'
import { safeNext } from '@/lib/auth/safe-next'
import { LOCALES } from '@/lib/i18n/config'

/**
 * `signInHref` is the producer half of the `?next=` contract; `safeNext` is the
 * consumer half. The property that actually matters is the round trip: anything
 * the producer emits must still be accepted by the consumer, and must come back
 * byte-identical. A producer/consumer disagreement is either a dead end (viewer
 * bounced to a hub) or an open redirect (viewer phished right after
 * authenticating), so it is asserted directly rather than inferred.
 */

/** Read `next` back exactly as `app/[locale]/sign-in/page.tsx` does. */
function readNextParam(href: string): string | undefined {
  const query = href.split('?')[1]
  if (!query) return undefined
  // Next.js decodes searchParams once before the page sees them.
  return new URLSearchParams(query).get('next') ?? undefined
}

describe('signInHref', () => {
  it('carries an in-app path as an encoded next param', () => {
    expect(signInHref('en', '/en/g/kowloon-noodles')).toBe(
      '/en/sign-in?next=%2Fen%2Fg%2Fkowloon-noodles',
    )
  })

  it('preserves a query string on the destination', () => {
    const href = signInHref('en', '/en/explore?destination=tokyo&page=2')
    expect(readNextParam(href)).toBe('/en/explore?destination=tokyo&page=2')
  })

  it('round-trips through safeNext unchanged — the property that matters', () => {
    const destination = '/en/experiences/harbour-cruise?ref=card'
    const href = signInHref('en', destination)

    const received = readNextParam(href)
    expect(received).toBeDefined()
    expect(safeNext(received, 'en')).toBe(destination)
  })

  it('round-trips for every supported locale', () => {
    for (const locale of LOCALES) {
      const destination = `/${locale}/trips`
      const received = readNextParam(signInHref(locale, destination))
      expect(safeNext(received, locale), `locale ${locale}`).toBe(destination)
    }
  })

  it.each([
    ['absolute url', 'https://evil.test/steal'],
    ['scheme-relative', '//evil.test/steal'],
    ['backslash scheme-relative', '/\\evil.test'],
    ['not a path', 'evil.test'],
    ['protocol-ish', 'javascript:alert(1)'],
    ['header-splitting control chars', '/en/studio\r\nLocation: https://evil.test'],
    ['a different locale', '/zh-hk/studio'],
    ['an unknown first segment', '/notalocale/studio'],
  ])('drops %s and falls back to the bare sign-in page', (_label, hostile) => {
    expect(signInHref('en', hostile)).toBe('/en/sign-in')
  })

  it('never emits a next param it would itself reject', () => {
    const hostile = ['https://evil.test', '//evil.test', '/zh-hk/studio', '/\\evil.test']
    for (const value of hostile) {
      const received = readNextParam(signInHref('en', value))
      // Either no next at all, or one that survives the consumer.
      expect(received === undefined || safeNext(received, 'en') !== null).toBe(true)
    }
  })

  it('falls back to the bare sign-in page for missing or blank input', () => {
    expect(signInHref('en', undefined)).toBe('/en/sign-in')
    expect(signInHref('en', null)).toBe('/en/sign-in')
    expect(signInHref('en', '   ')).toBe('/en/sign-in')
  })

  it('drops a destination that would be corrupted by the double decode', () => {
    // `safeNext` decodes once and Next decodes searchParams once, so a literal
    // percent sign cannot survive the trip. Dropping beats reflecting a URL
    // that silently differs from where the viewer actually was.
    expect(signInHref('en', '/en/explore?q=100%25')).toBe('/en/sign-in')
  })
})
