import type { Check, CheckResult } from '../types'
import { detailPath } from '../url'

/** Every published article URL (locale-fanned) must GET 200 on the live deploy. */
export const urlCoverage: Check = async ({ newstack }) => {
  const articles = await newstack.publishedArticles()
  const out: CheckResult[] = []
  for (const a of articles) {
    for (const locale of a.locales) {
      const path = detailPath(locale, a.category, a.url)
      if (!path) {
        out.push({
          check: 'url-coverage',
          target: `${a.category}/${a.url}`,
          status: 'fail',
          detail: `unrouted category "${a.category}"`,
        })
        continue
      }
      const status = await newstack.status(path)
      out.push({
        check: 'url-coverage',
        target: path,
        status: status === 200 ? 'pass' : 'fail',
        detail: `HTTP ${status}`,
      })
    }
  }
  return out
}
