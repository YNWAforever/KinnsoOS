export type CheckStatus = 'pass' | 'fail' | 'warn'

export interface CheckResult {
  check: string
  target: string
  status: CheckStatus
  detail: string
}

export interface PublishedArticle {
  url: string
  category: string // DB category enum value (singular)
  isCoupon: boolean
  locales: string[] // locales with a visible translation
}

/** Live read-model + deployed app. The CLI provides the real implementation; tests inject fakes. */
export interface NewStackSource {
  publishedArticles(): Promise<PublishedArticle[]>
  localeCounts(): Promise<Record<string, number>>
  seoRedirects(): Promise<Array<{ from_path: string; to_path: string }>>
  sitemapUrls(): Promise<Set<string>>
  status(path: string): Promise<number>
  html(path: string): Promise<string>
  redirect(path: string): Promise<{ status: number; location: string | null }>
}

/** Expected baseline. Default = fixtures (this env); sitemap/mysql modes at real cutover. */
export interface LegacySource {
  expectedUrlPaths(): Promise<Set<string>>
  localeCounts(): Promise<Record<string, number>>
  redirectSamples(): Promise<Array<{ from: string; to: string }>>
  negativePaths(): Promise<string[]>
}

export interface CheckContext {
  legacy: LegacySource
  newstack: NewStackSource
  sample: number // max articles to deep-parse in structured-data
}

export type Check = (ctx: CheckContext) => Promise<CheckResult[]>

export interface ParityReport {
  results: CheckResult[]
  counts: { pass: number; fail: number; warn: number }
  ok: boolean // ok === (fail count is 0)
}
