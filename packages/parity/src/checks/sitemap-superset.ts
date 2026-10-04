import type { Check, CheckResult } from '../types'

/** The live /sitemap.xml URL set must be a superset of the expected (baseline) published set. */
export const sitemapSuperset: Check = async ({ legacy, newstack }) => {
  const expected = await legacy.expectedUrlPaths()
  const actual = await newstack.sitemapUrls()
  const missing = [...expected].filter((p) => !actual.has(p))
  if (missing.length === 0) {
    return [{
      check: 'sitemap-superset',
      target: '/sitemap.xml',
      status: 'pass',
      detail: `${expected.size} expected URLs present`,
    }]
  }
  return missing.map((p): CheckResult => ({
    check: 'sitemap-superset',
    target: p,
    status: 'fail',
    detail: 'missing from sitemap',
  }))
}
