import { createHash } from 'node:crypto'
import type { ArticleRow, LegacyPostBundle } from '../types'
import { csvToArray, cdnUrl } from './arrays'
import { primaryCategory } from './category'
import { legacyToIso } from './datetime'

// Stable, locale-aware comparator so hashing is independent of reader row order
// (the legacy SELECTs don't fully ORDER BY, so array order isn't guaranteed).
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const sortBy = <T>(arr: readonly T[] | undefined, key: (x: T) => string): T[] =>
  [...(arr ?? [])].sort((a, b) => cmp(key(a), key(b)))

/** Deterministic content hash for idempotent upserts (excludes volatile fields like views). */
export function sourceHash(bundle: LegacyPostBundle): string {
  // Sort COPIES of every array by a natural key so identical content with a
  // different row order produces the same hash (don't mutate the bundle).
  const material = JSON.stringify({
    post: { ...bundle.post, views: undefined, updated_at: undefined },
    translations: sortBy(bundle.translations, (t) => t.locale),
    faqs: sortBy(bundle.faqs, (f) => `${f.language}${f.question}${f.weight ?? ''}`),
    authors: sortBy(bundle.authors, (a) => `${a.slug}${a.language}`),
    tags: sortBy(bundle.tags, (t) => t.slug).map((t) => ({
      ...t,
      translations: sortBy(t.translations, (tt) => tt.locale),
    })),
    categoryWeights: sortBy(bundle.categoryWeights, (c) => c.category_slug),
  })
  return createHash('sha256').update(material).digest('hex')
}

export function buildArticleRow(
  bundle: LegacyPostBundle,
  tagSlugs: string[],
  cdn: string,
  legacyTimezone = 'UTC',
): { row: ArticleRow; categoryDefaulted: boolean } {
  const p = bundle.post
  const { category, defaulted } = primaryCategory(bundle.categoryWeights)
  const toIso = (s: string | null) => legacyToIso(s, legacyTimezone)
  return {
    row: {
      legacy_post_id: p.id,
      slug: p.slug,
      url: p.url ?? p.slug,
      category,
      thumbnails: csvToArray(p.thumbnails).map((t) => cdnUrl(t, cdn)),
      authors: csvToArray(p.authors),
      regions: csvToArray(p.regions),
      // Legacy excluded EN coupon listings from the index; a post with offers is a coupon.
      is_coupon: csvToArray(p.offers).length > 0,
      tag_slugs: tagSlugs,
      rating: p.rating ?? null,
      views: p.views ?? 0,
      published_at: toIso(p.published_at),
      end_at: toIso(p.end_at),
      edit_at: toIso(p.edit_at),
      source: p.source ?? null,
      source_synced_at: null, // stamped by the upserter
      source_hash: sourceHash(bundle),
      deleted_at: toIso(p.deleted_at),
    },
    categoryDefaulted: defaulted,
  }
}
