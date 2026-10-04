import type { PublishedArticle } from './types'

// Singular DB category -> plural URL segment (mirrors apps/web/lib/i18n/config.ts).
const DB_TO_URL_SEGMENT: Record<string, string> = {
  destination: 'destinations',
  dining: 'dining',
  shopping: 'shopping',
}

/** null for unrouted categories (e.g. legacy `promotion`). */
export function urlSegment(category: string): string | null {
  return Object.hasOwn(DB_TO_URL_SEGMENT, category) ? DB_TO_URL_SEGMENT[category] : null
}

/** `/{locale}/articles/{segment}/{url}`, or null if the category is unrouted. */
export function detailPath(locale: string, category: string, url: string): string | null {
  const seg = urlSegment(category)
  return seg ? `/${locale}/articles/${seg}/${url}` : null
}

/** Every published article expanded across its present locales. */
export function publishedPaths(articles: PublishedArticle[]): string[] {
  const out: string[] = []
  for (const a of articles) {
    for (const locale of a.locales) {
      const p = detailPath(locale, a.category, a.url)
      if (p) out.push(p)
    }
  }
  return out
}
