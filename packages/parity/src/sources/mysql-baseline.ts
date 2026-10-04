import {
  isPostLive,
  transformPost,
  type LegacyPostBundle,
  type TransformWarning,
} from '@kinnso/sync'
import { detailPath, urlSegment } from '../url'

/**
 * Why this is not SQL.
 *
 * The R9.0 plan proposed deriving the baseline with two MySQL queries. It cannot work:
 * `isPostLive` is NOT the publication predicate. `transform/index.ts` runs
 * `validatePublication` and sets `article.published_at = null` for the WHOLE article on
 * any of — fewer than three non-empty content blocks, fewer than 150 visible words in a
 * locale, an invalid external link, no active named author. Those need parsed content
 * JSON, word segmentation, URL parsing and joined author rows, so no SQL predicate can
 * reproduce them.
 *
 * A SQL baseline would therefore be a strict SUPERSET of what the new stack publishes,
 * and every article in the gap would surface as a phantom `sitemap-superset` failure. A
 * gate that fails on differences that do not exist gets overridden, and an overridden
 * gate is a disabled gate.
 *
 * So the baseline runs the real code: fetch the real bundle, call the real
 * `transformPost`, and read the verdict off the article row it produces. If
 * `validatePublication`'s rules change, the baseline follows automatically, because it
 * is the same code path rather than a copy of it.
 */

export type SuppressionReason =
  | 'not_live'
  | 'publication_gate'
  | 'date_unparseable'
  | 'not_yet_published'
  | 'expired'
  | 'window_boundary'

export interface PublicArticleView {
  legacyPostId: number
  slug: string
  url: string
  category: string
  isCoupon: boolean
  locales: string[]
  publishedAt: string | null
  endAt: string | null
}

export interface ProjectedArticle {
  view: PublicArticleView
  /** True only when the new stack will serve this article now. */
  visible: boolean
  suppression: SuppressionReason | null
  warnings: TransformWarning[]
  /** Locale-fanned public paths, via the shared detailPath helper. */
  paths: string[]
  /**
   * Locale-STRIPPED `/articles/{segment}/{url}`. This is the redirect key:
   * `seo_redirects.from_path` is locale-agnostic and `apps/web/lib/redirects/resolve.ts`
   * strips the locale before looking it up, so matching a locale-prefixed path would
   * never hit.
   */
  canonicalPath: string | null
}

/** Thrown rather than dropping the path: a dropped path shrinks the baseline. */
export class UnroutableCategoryError extends Error {
  constructor(public readonly offenders: Array<{ legacyPostId: number; category: string; url: string }>) {
    super(
      `${offenders.length} article(s) have a category with no URL segment, so their paths cannot be ` +
        `derived and the baseline would silently shrink: ` +
        offenders.map((o) => `#${o.legacyPostId} "${o.category}" (${o.url})`).join(', '),
    )
    this.name = 'UnroutableCategoryError'
  }
}

const parseLegacyInstant = (value: string | null): number | null => {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

export interface ProjectOptions {
  legacyTimezone: string
  now: Date
  /**
   * Articles whose publication window opens or closes within this many ms of `now` are
   * excluded from both the expected and negative sets. The baseline is computed from
   * MySQL at one instant and the HTTP checks run against Postgres `now()` at another;
   * an article on the boundary would be asserted both ways.
   */
  windowGuardMs: number
}

/**
 * Classify one legacy bundle. Order is load-bearing — `not_live` must be decided before
 * the transform verdict, and the transform verdict before the publication window, or a
 * draft would be reported as a publication-gate loss.
 */
export function projectLegacyArticle(
  bundle: LegacyPostBundle,
  cdn: string,
  opts: ProjectOptions,
): ProjectedArticle {
  const payload = transformPost(bundle, cdn, { legacyTimezone: opts.legacyTimezone })
  const { article, warnings } = payload
  const locales = payload.translations.map((t) => t.locale as string)

  const view: PublicArticleView = {
    legacyPostId: Number(bundle.post.id),
    slug: bundle.post.slug,
    // Mirrors transform/article.ts: `url: p.url ?? p.slug`. posts.url is nullable.
    url: (bundle.post.url ?? bundle.post.slug) as string,
    category: article.category as string,
    isCoupon: Boolean(article.is_coupon),
    locales,
    publishedAt: article.published_at ?? null,
    endAt: article.end_at ?? null,
  }

  const seg = urlSegment(view.category)
  const canonicalPath = seg ? `/articles/${seg}/${view.url}` : null
  const paths = seg ? locales.map((l) => detailPath(l, view.category, view.url) as string) : []

  const suppressed = (reason: SuppressionReason): ProjectedArticle => ({
    view,
    visible: false,
    suppression: reason,
    warnings,
    paths,
    canonicalPath,
  })

  if (!isPostLive(bundle.post)) return suppressed('not_live')

  if (article.published_at === null) {
    // The transform unpublished it. Distinguish the modelled cause (validatePublication)
    // from anything else — an unmodelled third cause must not be filed as a known one.
    const gated = warnings.some((w) => w.kind === 'publication')
    return suppressed(gated ? 'publication_gate' : 'date_unparseable')
  }

  const publishedMs = parseLegacyInstant(view.publishedAt)
  const endMs = parseLegacyInstant(view.endAt)
  const nowMs = opts.now.getTime()

  const nearBoundary =
    (publishedMs !== null && Math.abs(publishedMs - nowMs) <= opts.windowGuardMs) ||
    (endMs !== null && Math.abs(endMs - nowMs) <= opts.windowGuardMs)
  if (nearBoundary) return suppressed('window_boundary')

  // Mirrors supabase/migrations/20260613000004_rls.sql: published_at <= now(), end_at >= now().
  if (publishedMs !== null && publishedMs > nowMs) return suppressed('not_yet_published')
  if (endMs !== null && endMs < nowMs) return suppressed('expired')

  return { view, visible: true, suppression: null, warnings, paths, canonicalPath }
}
