import type { Check, CheckResult } from '../types'
import { detailPath } from '../url'
import { extractJsonLd, extractHreflangs, extractMeta } from '../html'
import { DEFAULT_LOCALE, LOCALES } from '../locales'

/**
 * Deep-parse a sample of detail pages. Asserts: Article JSON-LD with dateModified,
 * BreadcrumbList, og:type=article, hreflang covers all present locales + x-default (reciprocity),
 * and x-default points at English when genuine, otherwise the first genuine locale.
 * (FAQPage is asserted on the flagship by Playwright, not in this bulk pass.)
 */
export const structuredData: Check = async ({ newstack, sample }) => {
  const articles = (await newstack.publishedArticles()).slice(0, Math.max(1, sample))
  const out: CheckResult[] = []
  for (const a of articles) {
    const genuineLocales = LOCALES.filter((locale) => a.locales.includes(locale))
    const xDefaultLocale = genuineLocales.includes(DEFAULT_LOCALE)
      ? DEFAULT_LOCALE
      : genuineLocales[0]
    for (const locale of genuineLocales) {
      const path = detailPath(locale, a.category, a.url)
      if (!path) continue
      const html = await newstack.html(path)
      const ld = extractJsonLd(html)
      const types = new Set(ld.map((o) => o['@type']))
      const article = ld.find((o) => o['@type'] === 'Article')
      const push = (label: string, ok: boolean, detail: string) =>
        out.push({ check: 'structured-data', target: `${path} ${label}`, status: ok ? 'pass' : 'fail', detail })

      push('Article', !!article, article ? 'present' : 'no Article JSON-LD')
      push('Article.dateModified', !!article?.['dateModified'], String(article?.['dateModified'] ?? '(missing)'))
      push('BreadcrumbList', types.has('BreadcrumbList'), `types: ${[...types].join(',') || '(none)'}`)

      const ogType = extractMeta(html, 'property', 'og:type')
      push('og:type', ogType === 'article', String(ogType ?? '(missing)'))

      const hreflangs = extractHreflangs(html)
      const expected = new Set<string>([...genuineLocales, 'x-default'])
      const got = new Set(hreflangs.keys())
      const exactAlternates =
        got.size === expected.size &&
        [...expected].every((locale) => got.has(locale))
      push(
        'hreflang',
        exactAlternates,
        `expected ${[...expected].sort().join(',')} got ` +
          `${[...got].sort().join(',') || '(none)'}`,
      )

      const xdef = hreflangs.get('x-default') ?? ''
      const expectedXDefaultPath = xDefaultLocale
        ? detailPath(xDefaultLocale, a.category, a.url)
        : null
      const xDefaultPath = xdef
        ? new URL(xdef, 'https://parity.invalid').pathname
        : null
      push('x-default', xDefaultPath === expectedXDefaultPath,
        `expected ${expectedXDefaultPath ?? '(missing)'} got ${xDefaultPath ?? '(missing)'}`)
    }
  }
  return out
}
