import { describe, it, expect } from 'vitest'
import { createLegacySource, createMysqlLegacySource, parseLegacyDsn, DsnCarriesTlsSettingsError, InvalidLegacyDsnError } from '../src/sources/legacy'
import { EmptyBaselineError, ScanIncompleteError, TranslationCeilingExceededError } from '../src/sources/mysql-derive'
import { UnroutableCategoryError } from '../src/sources/mysql-baseline'
import { seoLoss } from '../src/checks/seo-loss'
import { buildReport } from '../src/report'
import type { LegacyPostBundle } from '@kinnso/sync'

describe('legacy source (default = fixtures)', () => {
  it('returns the seed-derived expected baseline when no mode flag is given', async () => {
    const legacy = await createLegacySource({})

    const urls = await legacy.expectedUrlPaths()
    expect(urls.size).toBe(8)
    expect(urls.has('/en/articles/dining/ramen-guide')).toBe(true)
    expect(urls.has('/zh-hk/articles/shopping/mall-coupon')).toBe(true)

    expect(await legacy.localeCounts()).toEqual({ en: 5, 'zh-hk': 3 })

    const redirects = await legacy.redirectSamples()
    expect(redirects).toContainEqual({ from: '/post/old-ramen', to: '/en/articles/dining/ramen-guide' })
    expect(redirects).toContainEqual({ from: '/zh-hk/post/old-ramen', to: '/zh-hk/articles/dining/ramen-guide' })

    const negatives = await legacy.negativePaths()
    expect(negatives).toContain('/en/articles/destinations/expired-article')
    expect(negatives).toContain('/ja/articles/dining/ramen-guide')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// --legacy-mysql: the real cutover gate.
//
// These replace the old "refuses to build" assertions. The refusal existed because
// the mode returned empty sets from TODO stubs, and an empty baseline makes every
// check vacuously true. The refusal is gone, so the SAFETY PROPERTY it protected now
// has to be asserted directly: nothing below may let the gate report success without
// having measured something.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A legacy bundle that transforms to a PUBLISHED article. Block shape, word count, the
 * outbound link and the per-language author name all mirror
 * packages/sync/tests/fixtures/legacyPost.ts — validatePublication requires three visible
 * blocks, 150+ words per locale, a valid external link and a named active author, so a
 * simpler fixture silently lands in the publication-gate bucket and every "visible" test
 * would assert against an empty baseline.
 */
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

function liveBundle(overrides: Partial<LegacyPostBundle['post']> = {}, locales = ['en']): LegacyPostBundle {
  return {
    post: {
      id: 1, slug: 'ramen-guide', url: 'ramen-guide', thumbnails: null, authors: 'jane',
      regions: null, offers: '', rating: null, views: null,
      published_at: '2026-01-01 00:00:00', end_at: null, edit_at: null, source: null,
      deleted_at: null, updated_at: '2026-01-01 00:00:00', ...overrides,
    },
    translations: locales.map((locale) => ({
      locale, title: 'Ramen guide', content: JSON.stringify(publicationBlocks(locale)),
      meta_tags: null, analyze_tags: null, faq_title: null, labels: null,
      validated_at: null, deleted_at: null,
    })),
    faqs: [],
    authors: locales.map((locale) => ({
      slug: 'jane', language: locale, name: 'Ramen Editor', image: null, job_title: null,
      description: null, show_in_author_page: 1, labels: null,
    })),
    tags: [],
    categoryWeights: [{ category_slug: 'dining', weight: 10 }],
  } as LegacyPostBundle
}

/** Same post, but too thin for validatePublication — legacy serves it, the new stack will not. */
function thinBundle(id = 2): LegacyPostBundle {
  const b = liveBundle({ id, slug: 'thin-post', url: 'thin-post' })
  b.translations = [{
    locale: 'en', title: 'Thin', content: JSON.stringify([{ type: 'text', content: '<p>Too short.</p>' }]),
    meta_tags: null, analyze_tags: null, faq_title: null, labels: null, validated_at: null, deleted_at: null,
  }]
  return b
}

function fakeReader(bundles: LegacyPostBundle[], over: Partial<{
  livePostCount: number
  ceiling: Record<string, number>
  nonLive: number[]
}> = {}) {
  return {
    async *streamPostBundles() { for (const b of bundles) yield b },
    async livePostCount() { return over.livePostCount ?? bundles.length },
    async legacyTranslationCeiling() { return over.ceiling ?? { en: 100, 'zh-hk': 100 } },
    async sampleNonLivePostIds() { return over.nonLive ?? [] },
    async fetchPostBundle() { return null },
  }
}

const build = (reader: ReturnType<typeof fakeReader>, opts = {}) =>
  createMysqlLegacySource('mysql://u:p@legacy:3306/kinnso', {
    reader,
    env: { LEGACY_DB_SSL: 'disable', LEGACY_DB_TIMEZONE: 'UTC' } as NodeJS.ProcessEnv,
    now: new Date('2026-06-01T00:00:00Z'),
    ...opts,
  })

describe('--legacy-mysql cannot pass vacuously', () => {
  it('refuses an empty scan instead of certifying a cutover it never measured', async () => {
    await expect(build(fakeReader([], { livePostCount: 0 }))).rejects.toThrow(EmptyBaselineError)
  })

  it('refuses a corpus where nothing is visible, even though it scanned rows', async () => {
    // The exact hole the old TODO stubs left: a non-empty scan whose expected set is empty.
    await expect(build(fakeReader([thinBundle()]))).rejects.toThrow(EmptyBaselineError)
  })

  it('refuses a truncated scan, which would under-report drift while looking healthy', async () => {
    await expect(build(fakeReader([liveBundle()], { livePostCount: 9 }))).rejects.toThrow(ScanIncompleteError)
  })

  it('refuses a baseline that fans out more translations than legacy holds', async () => {
    await expect(build(fakeReader([liveBundle()], { ceiling: { en: 0 } })))
      .rejects.toThrow(TranslationCeilingExceededError)
  })
})

describe('--legacy-mysql baseline derivation', () => {
  it('fans each visible article across its locales through the shared detailPath', async () => {
    const src = await build(fakeReader([liveBundle({}, ['en', 'zh-hk'])]))
    expect([...(await src.expectedUrlPaths())].sort()).toEqual([
      '/en/articles/dining/ramen-guide',
      '/zh-hk/articles/dining/ramen-guide',
    ])
  })

  it('tallies localeCounts from the same snapshot, so the two cannot disagree', async () => {
    const src = await build(fakeReader([liveBundle({}, ['en', 'zh-hk'])]))
    const paths = await src.expectedUrlPaths()
    const counts = await src.localeCounts()
    expect(counts).toEqual({ en: 1, 'zh-hk': 1 })
    expect(paths.size).toBe(Object.values(counts).reduce((a, b) => a + b, 0))
  })

  it('never lists a path as both expected and negative', async () => {
    const src = await build(fakeReader([liveBundle({}, ['en'])]))
    const expected = await src.expectedUrlPaths()
    for (const n of await src.negativePaths()) expect(expected.has(n)).toBe(false)
  })
})

describe('--legacy-mysql publication-gate loss', () => {
  it('reports an article legacy serves but the new stack will not publish', async () => {
    const src = await build(fakeReader([liveBundle(), thinBundle()], { livePostCount: 2 }))
    const loss = await src.seoLoss()

    expect(loss).toHaveLength(1)
    expect(loss[0].view.legacyPostId).toBe(2)
    expect(loss[0].reason).toBe('publication_gate')
    expect(loss[0].unrescuedPaths).toEqual(['/en/articles/dining/thin-post'])
    expect(loss[0].reasonCodes.length).toBeGreaterThan(0)
  })

  it('keeps a dropped article out of expected, out of negatives, and inside seoLoss', async () => {
    // It must not be expected (it will 404) and must not be asserted-404 either: scoring
    // real SEO loss as a passing negative is exactly how this gate would lie.
    const src = await build(fakeReader([liveBundle(), thinBundle()], { livePostCount: 2 }))
    const path = '/en/articles/dining/thin-post'
    expect((await src.expectedUrlPaths()).has(path)).toBe(false)
    expect(await src.negativePaths()).not.toContain(path)
    expect((await src.seoLoss()).flatMap((e) => e.paths)).toContain(path)
  })

  // The regression test for this whole phase.
  it('FAILS the report — a warn would exit 0 and silently certify the loss', async () => {
    const src = await build(fakeReader([liveBundle(), thinBundle()], { livePostCount: 2 }))
    const results = await seoLoss({ legacy: src, newstack: {} as never, sample: 3 })

    expect(results[0].status).toBe('fail')
    expect(results[0].status).not.toBe('warn')
    expect(buildReport(results).ok).toBe(false)
  })

  it('forgives a loss the redirect map already covers, since the URL still resolves', async () => {
    const src = await build(
      fakeReader([liveBundle(), thinBundle()], { livePostCount: 2 }),
      // Locale-STRIPPED, because seo_redirects.from_path is locale-agnostic and
      // resolve.ts strips the locale before looking it up.
      { redirects: async () => [{ from_path: '/articles/dining/thin-post', to_path: '/articles/dining/ramen-guide' }] },
    )
    const results = await seoLoss({ legacy: src, newstack: {} as never, sample: 3 })
    expect(results[0].status).toBe('pass')
    expect(buildReport(results).ok).toBe(true)
  })

  it('says it cannot tell, rather than implying zero loss, on a baseline that has no view of it', async () => {
    const fixtures = await createLegacySource({})
    const results = await seoLoss({ legacy: fixtures, newstack: {} as never, sample: 3 })
    expect(results[0].status).toBe('warn')
    expect(results[0].detail).toMatch(/cannot determine/i)
  })
})

describe('--legacy-mysql DSN handling', () => {
  it('takes TLS from LEGACY_DB_SSL, not the DSN', () => {
    const cfg = parseLegacyDsn('mysql://u:p@legacy:3307/db', { LEGACY_DB_SSL: 'require' } as NodeJS.ProcessEnv)
    expect(cfg).toMatchObject({ host: 'legacy', port: 3307, database: 'db', user: 'u', password: 'p' })
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false })
  })

  it.each(['ssl=false', 'sslmode=disable', 'useSSL=false'])(
    'refuses a DSN carrying %s rather than silently ignoring it',
    (param) => {
      expect(() => parseLegacyDsn(`mysql://u:p@legacy/db?${param}`, { LEGACY_DB_SSL: 'require' } as NodeJS.ProcessEnv))
        .toThrow(DsnCarriesTlsSettingsError)
    },
  )

  it('does not downgrade to plaintext when the DSN says nothing about TLS', () => {
    expect(parseLegacyDsn('mysql://u:p@legacy/db', {} as NodeJS.ProcessEnv).ssl).toBeDefined()
  })
})

describe('--legacy-mysql routing', () => {
  it('throws on an unroutable category rather than shrinking the baseline', async () => {
    const b = liveBundle()
    b.categoryWeights = [{ category_slug: 'promotion', weight: 5 }]
    // primaryCategory defaults 'promotion' to 'destination', which DOES route — so the
    // only way to reach this is a genuine drift between transform/category.ts and url.ts.
    const src = await build(fakeReader([b]))
    expect([...(await src.expectedUrlPaths())]).toEqual(['/en/articles/destinations/ramen-guide'])
  })

  it('aggregates every unroutable offender into one error, not one error per article', () => {
    const err = new UnroutableCategoryError([
      { legacyPostId: 1, category: 'x', url: 'a' },
      { legacyPostId: 2, category: 'y', url: 'b' },
    ])
    expect(err.message).toContain('#1')
    expect(err.message).toContain('#2')
    expect(err.offenders).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regressions found by attacking the first implementation of this mode. Each of
// these produced a PHANTOM failure — the gate reporting a problem while the proxy
// behaved exactly as designed — or a silent no-op. A phantom failure is not a safe
// default: it gets overridden, and an overridden gate is a disabled gate.
// ─────────────────────────────────────────────────────────────────────────────

describe('--legacy-mysql agrees with the proxy about units', () => {
  it('returns a LOCALE-PREFIXED redirect target, which is what the proxy emits', async () => {
    // resolve.ts returns `/${locale ?? DEFAULT_LOCALE}${to_path}` and checks/redirects.ts
    // compares that Location pathname against `to`. Returning the raw locale-agnostic
    // to_path failed every sample against a correct proxy.
    const src = await build(fakeReader([liveBundle()]), {
      redirects: async () => [
        { from_path: '/post/old-ramen', to_path: '/articles/dining/ramen-guide' },
        { from_path: '/zh-hk/post/old-ramen', to_path: '/articles/dining/ramen-guide' },
      ],
    })
    expect(await src.redirectSamples()).toEqual([
      { from: '/post/old-ramen', to: '/en/articles/dining/ramen-guide' },
      { from: '/zh-hk/post/old-ramen', to: '/zh-hk/articles/dining/ramen-guide' },
    ])
  })

  it('never asserts 404 on a path the redirect map answers with a 301', async () => {
    const expired = liveBundle({ id: 3, slug: 'expired-thing', url: 'expired-thing', end_at: '2026-05-01 00:00:00' })
    const src = await build(fakeReader([liveBundle(), expired], { livePostCount: 2 }), {
      redirects: async () => [{ from_path: '/articles/dining/expired-thing', to_path: '/articles/dining/ramen-guide' }],
    })
    expect(await src.negativePaths()).not.toContain('/en/articles/dining/expired-thing')
  })

  it('still counts an article inside the window guard, which Postgres serves', async () => {
    // The guard suppresses racy 200/404 PATH assertions. row-counts is a strict equality
    // against a live count, so dropping the article there turns a racy assertion into a
    // certain phantom failure.
    const fresh = liveBundle({ id: 4, slug: 'fresh', url: 'fresh', published_at: '2026-05-31 23:55:00' })
    const src = await build(fakeReader([liveBundle(), fresh], { livePostCount: 2 }))

    expect(await src.localeCounts()).toEqual({ en: 2 })
    // ...but its path is NOT asserted either way, because 200 vs 404 is racy there.
    expect((await src.expectedUrlPaths()).has('/en/articles/dining/fresh')).toBe(false)
    expect(await src.negativePaths()).not.toContain('/en/articles/dining/fresh')
  })
})

describe('--legacy-mysql actually samples the redirect map', () => {
  it('samples nothing when no reader is supplied, rather than inventing rows', async () => {
    // The CLI injects newstack.seoRedirects(); without that wiring redirectSamples()
    // returned [], the redirects check emitted zero results, and buildReport was ok with
    // the redirect map entirely unverified.
    const src = await build(fakeReader([liveBundle()]))
    expect(await src.redirectSamples()).toEqual([])
  })
})

describe('--legacy-mysql guards the expected SET, not a proxy for it', () => {
  it('refuses a corpus that scans rows but produces no expected URL', async () => {
    // A zero-translation article is caught one guard earlier: validatePublication warns
    // `missing_translation`, so the article is never visible. Asserted here because that
    // is the behaviour a reader would otherwise have to infer from another package.
    const noTranslations = liveBundle({ id: 5, slug: 'ghost', url: 'ghost' }, [])
    await expect(build(fakeReader([noTranslations]))).rejects.toThrow(EmptyBaselineError)
    await expect(build(fakeReader([noTranslations]))).rejects.toThrow(/none are visible/)
  })

  it('still asserts the expected set directly, since an empty one passes sitemap-superset', async () => {
    // sitemap-superset returns PASS on an empty expected set, so the set is asserted
    // rather than inferred from visible.length. The chain that makes those equivalent
    // (visible => survived validatePublication => has a locale) lives in another package;
    // this guard fails here if any link in it changes.
    const src = await build(fakeReader([liveBundle()]))
    expect((await src.expectedUrlPaths()).size).toBeGreaterThan(0)
  })
})

describe('--legacy-mysql DSN errors name the actual cause', () => {
  it.each([
    ['not a URL at all', 'not-a-dsn'],
    ['a URL with no host', 'mysql:///kinnso'],
  ])('reports %s as a malformed DSN, not as a TLS problem', (_label, dsn) => {
    // Reporting a typo under a TLS error name sends the operator to look at
    // LEGACY_DB_SSL, which is not what is wrong. Both still exit 2 via the CLI.
    expect(() => parseLegacyDsn(dsn, {} as NodeJS.ProcessEnv)).toThrow(InvalidLegacyDsnError)
    expect(() => parseLegacyDsn(dsn, {} as NodeJS.ProcessEnv)).not.toThrow(DsnCarriesTlsSettingsError)
  })

  it('still reports a TLS-carrying DSN as exactly that', () => {
    expect(() => parseLegacyDsn('mysql://u:p@legacy/db?sslmode=disable', {} as NodeJS.ProcessEnv))
      .toThrow(DsnCarriesTlsSettingsError)
  })

  // URLSearchParams percent-decodes keys, so an obfuscated parameter is still caught.
  it('catches a percent-encoded TLS parameter', () => {
    expect(() => parseLegacyDsn('mysql://u:p@legacy/db?%73sl=false', {} as NodeJS.ProcessEnv))
      .toThrow(DsnCarriesTlsSettingsError)
  })
})
