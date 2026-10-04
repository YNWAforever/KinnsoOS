import { LegacyReader, legacySsl, legacyTimezone, type SyncConfig } from '@kinnso/sync'
import type { LegacySource } from '../types'
import { createFixtureLegacySource } from '../fixtures/baseline'
import { deriveMysqlBaseline, type MysqlBaselineSnapshot, type SeoLossEntry } from './mysql-derive'
import { DEFAULT_LOCALE, LOCALES } from '../locales'

/** Mirrors resolve.ts: the locale prefix if the path carries one, else the default. */
function localeOf(path: string): string {
  const first = path.split('/')[1]
  return (LOCALES as readonly string[]).includes(first) ? first : DEFAULT_LOCALE
}

export interface LegacyConfig {
  sitemapUrl?: string
  mysqlDsn?: string
  /**
   * Reads `seo_redirects`. Injected by the CLI from the newstack source so the baseline
   * never opens a Supabase client of its own — and so `--legacy-mysql` actually samples
   * the table Task 1 ingests. Without it the redirects check emits zero results and the
   * report is `ok` with the redirect map entirely unverified.
   */
  redirects?: () => Promise<Array<{ from_path: string; to_path: string }>>
}

/** Default = fixture baseline (this env). --legacy-sitemap / --legacy-mysql are cutover-only. */
export async function createLegacySource(cfg: LegacyConfig): Promise<LegacySource> {
  if (cfg.mysqlDsn) return createMysqlLegacySource(cfg.mysqlDsn, { redirects: cfg.redirects })
  if (cfg.sitemapUrl) return createSitemapLegacySource(cfg.sitemapUrl)
  return createFixtureLegacySource()
}

/** Legacy sitemap mode: baseline URL set is the legacy sitemap's <loc> entries. */
function createSitemapLegacySource(sitemapUrl: string): LegacySource {
  return {
    async expectedUrlPaths() {
      const xml = await (await fetch(sitemapUrl)).text()
      return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))
    },
    async localeCounts() {
      return {} // not derivable from a sitemap -> row-counts check self-skips (warn)
    },
    async redirectSamples() {
      return [] // supplied via fixtures or MySQL at cutover
    },
    async negativePaths() {
      return []
    },
  }
}

/** A DSN that could carry TLS settings would silently bypass LEGACY_DB_SSL. */
export class DsnCarriesTlsSettingsError extends Error {
  name = 'DsnCarriesTlsSettingsError'
}

/**
 * The DSN is malformed. Distinct from DsnCarriesTlsSettingsError on purpose: reporting a
 * typo'd URL under a TLS error name sends the operator to look at LEGACY_DB_SSL, which is
 * not the problem. Both still exit 2.
 */
export class InvalidLegacyDsnError extends Error {
  name = 'InvalidLegacyDsnError'
}

const TLS_PARAMS = ['ssl', 'sslmode', 'usessl', 'ssl-mode', 'ssl_mode']

/**
 * Parse host/port/user/password/database out of a MySQL DSN. TLS and timezone come
 * STRICTLY from the environment (`legacySsl` / `legacyTimezone`), never from the DSN, so
 * `--legacy-mysql` cannot silently downgrade a connection that `LEGACY_DB_SSL` says must
 * be encrypted. A DSN carrying a TLS parameter is rejected rather than ignored: ignoring
 * it would leave an operator believing a setting applied when it did not.
 */
export function parseLegacyDsn(dsn: string, env: NodeJS.ProcessEnv = process.env): SyncConfig['legacy'] {
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    throw new InvalidLegacyDsnError(`--legacy-mysql is not a valid URL: ${dsn}`)
  }
  for (const [key] of url.searchParams) {
    if (TLS_PARAMS.includes(key.toLowerCase())) {
      throw new DsnCarriesTlsSettingsError(
        `The --legacy-mysql DSN carries "${key}", but TLS is controlled by LEGACY_DB_SSL so that ` +
          'setting would be silently ignored. Remove it and set LEGACY_DB_SSL instead.',
      )
    }
  }
  if (!url.hostname) throw new InvalidLegacyDsnError('The --legacy-mysql DSN has no host.')

  const ssl = legacySsl(env)
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'kinnso',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ...(ssl ? { ssl } : {}),
    sslMode: (env.LEGACY_DB_SSL ?? 'require') as SyncConfig['legacy']['sslMode'],
  }
}

/**
 * A MySQL-backed baseline exposes strictly more than the four LegacySource methods: it
 * knows which articles legacy serves that the new stack will deliberately NOT publish.
 * That set is required, not optional — an optional method is how a vacuous mode gets
 * rebuilt in a smaller room.
 */
export interface ClassifyingLegacySource extends LegacySource {
  seoLoss(): Promise<SeoLossEntry[]>
  snapshot(): MysqlBaselineSnapshot
}

export interface MysqlSourceOptions {
  env?: NodeJS.ProcessEnv
  now?: Date
  cdnBase?: string
  windowGuardMs?: number
  negativeSample?: number
  pageSize?: number
  /** Injected in tests; production reads seo_redirects through the reader's own pool. */
  redirects?: () => Promise<Array<{ from_path: string; to_path: string }>>
  reader?: Parameters<typeof deriveMysqlBaseline>[0]
}

/**
 * Legacy MySQL mode — the real production cutover gate.
 *
 * The baseline is derived by running the sync's own `transformPost` over real legacy
 * bundles, because `isPostLive` is not the publication predicate: `validatePublication`
 * unpublishes articles for content-quality reasons no SQL can express. See
 * `mysql-baseline.ts` for the full rationale.
 *
 * Everything that would leave the gate unable to measure throws from here, so the CLI
 * reports exit 2 (misconfiguration) rather than a vacuous pass.
 */
export async function createMysqlLegacySource(
  dsn: string,
  opts: MysqlSourceOptions = {},
): Promise<ClassifyingLegacySource> {
  const env = opts.env ?? process.env
  const reader = opts.reader ?? new LegacyReader(parseLegacyDsn(dsn, env))
  const readRedirects = opts.redirects ?? (async () => [])

  const snapshot = await deriveMysqlBaseline(reader, {
    cdnBase: opts.cdnBase ?? env.CDN_BASE ?? '',
    legacyTimezone: legacyTimezone(env),
    now: opts.now ?? new Date(),
    windowGuardMs: opts.windowGuardMs,
    negativeSample: opts.negativeSample,
    pageSize: opts.pageSize,
    redirects: readRedirects,
  })

  return {
    async expectedUrlPaths() {
      return snapshot.expectedUrlPaths
    },
    async localeCounts() {
      return snapshot.localeCounts
    },
    async redirectSamples() {
      // The legacy redirect map is the baseline, so sampling what Task 1 ingested closes
      // the loop: these are the rows apps/web/proxy.ts must actually serve.
      //
      // `to` must be LOCALE-PREFIXED. seo_redirects.to_path is locale-agnostic, but
      // resolve.ts emits `/${locale ?? DEFAULT_LOCALE}${to_path}` and checks/redirects.ts
      // compares against the Location pathname. Returning the raw to_path would fail every
      // sample while the proxy behaved exactly as designed.
      const rows = await readRedirects()
      return rows.map((r) => ({ from: r.from_path, to: `/${localeOf(r.from_path)}${r.to_path}` }))
    },
    async negativePaths() {
      return snapshot.negativePaths
    },
    async seoLoss() {
      return snapshot.seoLoss
    },
    snapshot() {
      return snapshot
    },
  }
}
