import { createNewStackSource } from './sources/newstack'
import { createLegacySource } from './sources/legacy'
import { urlCoverage } from './checks/url-coverage'
import { sitemapSuperset } from './checks/sitemap-superset'
import { redirects } from './checks/redirects'
import { rowCounts } from './checks/row-counts'
import { structuredData } from './checks/structured-data'
import { negative404 } from './checks/negative-404'
import { seoLoss } from './checks/seo-loss'
import { buildReport, renderTable } from './report'
import type { Check, CheckResult } from './types'

export interface CliConfig {
  baseUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
  legacySitemap?: string
  legacyMysql?: string
  sample: number
  json: boolean
  failFast: boolean
}

const DEFAULT_BASE_URL = 'https://remix-kinnso-web.vercel.app'

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv): CliConfig {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const flag = (name: string) => argv.includes(name)

  const baseUrl = value('--base-url') ?? env.BASE_URL ?? env.E2E_BASE_URL ?? DEFAULT_BASE_URL
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    supabaseUrl: value('--supabase-url') ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? '',
    supabaseAnonKey: value('--supabase-anon-key') ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '',
    legacySitemap: value('--legacy-sitemap'),
    legacyMysql: value('--legacy-mysql'),
    sample: Number(value('--sample') ?? '3') || 3,
    json: flag('--json'),
    failFast: flag('--fail-fast'),
  }
}

const CHECKS: Check[] = [urlCoverage, sitemapSuperset, redirects, rowCounts, structuredData, negative404, seoLoss]

/** Runs all checks and returns a process exit code (0 pass, 1 parity fail, 2 misconfig). */
export async function run(cfg: CliConfig): Promise<number> {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    console.error(
      'Missing Supabase credentials. Pass --supabase-url and --supabase-anon-key, or set ' +
        'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
    return 2
  }
  const newstack = createNewStackSource({
    baseUrl: cfg.baseUrl,
    supabaseUrl: cfg.supabaseUrl,
    supabaseAnonKey: cfg.supabaseAnonKey,
  })
  // A baseline source that refuses to build is a MISCONFIGURATION (exit 2), not a parity
  // failure (exit 1) — the gate never ran, so reporting "fail" would misstate what happened.
  let legacy
  try {
    legacy = await createLegacySource({
      sitemapUrl: cfg.legacySitemap,
      mysqlDsn: cfg.legacyMysql,
      // The MySQL baseline samples the redirect map through the newstack's own reader, so
      // there is one Supabase client for the run and the sampled rows are the ones the
      // proxy will actually serve.
      redirects: () => newstack.seoRedirects(),
    })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 2
  }

  const all: CheckResult[] = []
  for (const check of CHECKS) {
    const results = await check({ legacy, newstack, sample: cfg.sample })
    all.push(...results)
    if (cfg.failFast && results.some((r) => r.status === 'fail')) break
  }

  const report = buildReport(all)
  console.log(cfg.json ? JSON.stringify(report, null, 2) : renderTable(report))
  return report.ok ? 0 : 1
}
