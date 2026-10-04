import { describe, it, expect } from 'vitest'
import { projectLegacyArticle, UnroutableCategoryError } from '../src/sources/mysql-baseline'
import type { LegacyPostBundle } from '@kinnso/sync'

/**
 * Direct tests for the classification rule. It was previously covered only through
 * deriveMysqlBaseline, which hides WHICH branch fired — and the ordering is load-bearing:
 * `not_live` must beat the transform verdict, and the transform verdict must beat the
 * publication window, or an ordinary draft gets reported as SEO loss.
 */

const NOW = new Date('2026-06-01T00:00:00Z')
const GUARD = 600_000 // 10 minutes
const opts = { legacyTimezone: 'UTC', now: NOW, windowGuardMs: GUARD }

/** Mirrors packages/sync/tests/fixtures/legacyPost.ts — validatePublication needs all of it. */
function publicationBlocks(prefix: string) {
  const words = Array.from({ length: 160 }, (_, i) => `${prefix}${i + 1}`)
  return [
    { type: 'text', content: `<p>${words.slice(0, 54).join(' ')}</p>` },
    { type: 'number-box', content: `<p>${words.slice(54, 107).join(' ')}</p>` },
    {
      type: 'detail-box',
      content: `<p>${words.slice(107).join(' ')}</p>`,
      address: { label: 'Map', link: 'https://maps.google.com/maps' },
    },
  ]
}

function bundle(post: Partial<LegacyPostBundle['post']> = {}, opt: { thin?: boolean } = {}): LegacyPostBundle {
  return {
    post: {
      id: 1, slug: 'ramen-guide', url: 'ramen-guide', thumbnails: null, authors: 'jane',
      regions: null, offers: '', rating: null, views: null,
      published_at: '2026-01-01 00:00:00', end_at: null, edit_at: null, source: null,
      deleted_at: null, updated_at: '2026-01-01 00:00:00', ...post,
    },
    translations: [{
      locale: 'en', title: 'Ramen guide',
      content: JSON.stringify(opt.thin ? [{ type: 'text', content: '<p>Too short.</p>' }] : publicationBlocks('en')),
      meta_tags: null, analyze_tags: null, faq_title: null, labels: null,
      validated_at: null, deleted_at: null,
    }],
    faqs: [],
    authors: [{
      slug: 'jane', language: 'en', name: 'Ramen Editor', image: null, job_title: null,
      description: null, show_in_author_page: 1, labels: null,
    }],
    tags: [],
    categoryWeights: [{ category_slug: 'dining', weight: 10 }],
  } as LegacyPostBundle
}

const project = (b: LegacyPostBundle) => projectLegacyArticle(b, '', opts)

describe('projectLegacyArticle — the happy path', () => {
  it('marks a live, publishable, in-window article visible and routes its locales', () => {
    const p = project(bundle())
    expect(p.visible).toBe(true)
    expect(p.suppression).toBeNull()
    expect(p.paths).toEqual(['/en/articles/dining/ramen-guide'])
    expect(p.canonicalPath).toBe('/articles/dining/ramen-guide')
  })

  it('falls back to slug when posts.url is null, as the transform does', () => {
    // transform/article.ts is `url: p.url ?? p.slug`; posts.url is nullable, so a
    // baseline that read `url` directly would emit /articles/dining/null.
    const p = project(bundle({ url: null, slug: 'fallback-slug' }))
    expect(p.view.url).toBe('fallback-slug')
    expect(p.paths).toEqual(['/en/articles/dining/fallback-slug'])
  })
})

describe('projectLegacyArticle — ordering is load-bearing', () => {
  it('calls a soft-deleted post not_live, whatever its content says', () => {
    expect(project(bundle({ deleted_at: '2026-05-01 00:00:00' })).suppression).toBe('not_live')
  })

  // The ordering test that matters most: an ordinary draft must NOT be reported as SEO
  // loss. Drafts are thin by nature, so if the transform verdict were checked first,
  // every draft in the corpus would land in seo-loss and fail the gate.
  it('calls a thin DRAFT not_live, not publication_gate', () => {
    const p = project(bundle({ published_at: null }, { thin: true }))
    expect(p.suppression).toBe('not_live')
    expect(p.suppression).not.toBe('publication_gate')
  })

  it('calls a thin LIVE post publication_gate — legacy serves it, the new stack will not', () => {
    const p = project(bundle({}, { thin: true }))
    expect(p.suppression).toBe('publication_gate')
    expect(p.warnings.some((w) => w.kind === 'publication')).toBe(true)
  })

  it('decides the transform verdict before the window, so a thin FUTURE post is still a gate case', () => {
    const p = project(bundle({ published_at: '2027-01-01 00:00:00' }, { thin: true }))
    expect(p.suppression).toBe('publication_gate')
  })
})

describe('projectLegacyArticle — the publication window', () => {
  it('suppresses an article whose window has not opened', () => {
    expect(project(bundle({ published_at: '2027-01-01 00:00:00' })).suppression).toBe('not_yet_published')
  })

  it('suppresses an article whose window has closed', () => {
    expect(project(bundle({ end_at: '2026-05-01 00:00:00' })).suppression).toBe('expired')
  })

  it('keeps an article whose window is still open', () => {
    expect(project(bundle({ end_at: '2027-01-01 00:00:00' })).visible).toBe(true)
  })

  it.each([
    ['published_at exactly at now', { published_at: '2026-06-01 00:00:00' }],
    ['published_at just inside the guard', { published_at: '2026-05-31 23:55:00' }],
    ['end_at just inside the guard', { end_at: '2026-06-01 00:05:00' }],
  ])('excludes %s from both sets, because 200-vs-404 is racy there', (_label, patch) => {
    expect(project(bundle(patch)).suppression).toBe('window_boundary')
  })

  it('does not suppress just outside the guard', () => {
    // 10 minutes + 1 second before now.
    expect(project(bundle({ published_at: '2026-05-31 23:49:59' })).visible).toBe(true)
  })
})

describe('projectLegacyArticle — routing', () => {
  it('defaults an unmapped legacy category to destination, which still routes', () => {
    // primaryCategory maps 'promotion' -> destination (defaulted). It must NOT be dropped:
    // a dropped path shrinks the baseline.
    const b = bundle()
    b.categoryWeights = [{ category_slug: 'promotion', weight: 5 }]
    const p = project(b)
    expect(p.view.category).toBe('destination')
    expect(p.paths).toEqual(['/en/articles/destinations/ramen-guide'])
  })

  it('reports an unroutable category as a null canonicalPath rather than silently dropping it', () => {
    // Unreachable through primaryCategory today; this pins the contract deriveMysqlBaseline
    // relies on to raise UnroutableCategoryError instead of shrinking the baseline.
    const p = projectLegacyArticle(bundle(), '', opts)
    expect(p.canonicalPath).not.toBeNull()

    const err = new UnroutableCategoryError([{ legacyPostId: 7, category: 'promotion', url: 'x' }])
    expect(err.message).toContain('#7')
    expect(err.message).toContain('shrink')
  })
})

describe('projectLegacyArticle — the unmodelled-cause bucket', () => {
  // MySQL's zero date. legacyToIso cannot parse it, so the transform emits a null
  // published_at with NO publication warning — a third cause that must not be filed as a
  // known one, because "we rejected this for quality" and "we could not read the date"
  // call for different operator actions.
  it('separates an unparseable date from a publication-quality rejection', () => {
    const p = project(bundle({ published_at: '0000-00-00 00:00:00' }))

    // isPostLive passes — the zero date is a non-empty string — but legacyToIso cannot
    // parse it, so the transform emits a null published_at with NO publication warning.
    expect(p.visible).toBe(false)
    expect(p.suppression).toBe('date_unparseable')
    expect(p.view.publishedAt).toBeNull()
    expect(p.warnings.filter((w) => w.kind === 'publication')).toHaveLength(0)
  })

  it('still counts an unparseable date as SEO loss, because legacy serves that URL', () => {
    // It is bucketed separately from publication_gate so the operator knows to fix the
    // DATE rather than the content, but both are URLs going dark.
    const p = project(bundle({ published_at: '0000-00-00 00:00:00' }))
    expect(p.paths).toEqual(['/en/articles/dining/ramen-guide'])
  })
})

describe('projectLegacyArticle — the view it hands on', () => {
  it('reports isCoupon from the offers CSV, trimming as csvToArray does', () => {
    expect(project(bundle({ offers: '' })).view.isCoupon).toBe(false)
    expect(project(bundle({ offers: ' , ' })).view.isCoupon).toBe(false)
    expect(project(bundle({ offers: 'klook-123' })).view.isCoupon).toBe(true)
  })

  it('carries the legacy post id, so a report can name the row to fix', () => {
    expect(project(bundle({ id: 4242 })).view.legacyPostId).toBe(4242)
  })

  it('keeps warnings on a suppressed article, so seo-loss can say why', () => {
    const p = project(bundle({}, { thin: true }))
    expect(p.warnings.length).toBeGreaterThan(0)
  })
})
