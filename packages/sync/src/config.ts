/**
 * TLS options handed straight to mysql2's pool (it accepts `ssl` as part of the
 * connection config). `undefined` means "omit the key entirely", which is the only
 * way to get a genuinely plaintext connection out of mysql2.
 */
export interface LegacySslOptions {
  rejectUnauthorized: boolean
  ca?: string
}

export interface SyncConfig {
  legacy: {
    host: string
    port: number
    database: string
    user: string
    password: string
    ssl?: LegacySslOptions
    /**
     * The resolved LEGACY_DB_SSL mode, carried so a connection failure can name
     * it. Optional: it is diagnostic metadata, not connection config, so test
     * fixtures may omit it and the reader falls back to inferring from `ssl`.
     */
    sslMode?: LegacySslMode
  }
  supabaseUrl: string
  serviceRoleKey: string
  cdnBase: string
  /** Timezone the legacy MySQL DATETIME columns are written in (see `legacyTimezone`). */
  legacyTimezone: string
}

const SSL_MODES = ['require', 'verify-ca', 'disable'] as const
export type LegacySslMode = (typeof SSL_MODES)[number]

/**
 * Legacy MySQL is reached over the public internet, so TLS is the default and an
 * operator has to opt OUT explicitly. The three modes are deliberately coarse:
 *   require   — encrypt, but accept the server cert unverified (self-signed / managed
 *               MySQL with a private CA). Stops passive sniffing of credentials and
 *               article content; does NOT stop an active MITM.
 *   verify-ca — encrypt AND verify against LEGACY_DB_SSL_CA. The only fully safe mode.
 *   disable   — plaintext. Only correct when the legacy server has no TLS at all.
 * Anything else throws rather than silently degrading to plaintext.
 */
export function legacySsl(env: NodeJS.ProcessEnv): LegacySslOptions | undefined {
  const raw = env.LEGACY_DB_SSL ?? 'require'
  if (!(SSL_MODES as readonly string[]).includes(raw)) {
    throw new Error(`Invalid LEGACY_DB_SSL "${raw}" (expected one of ${SSL_MODES.join(', ')})`)
  }
  const mode = raw as LegacySslMode
  if (mode === 'disable') return undefined
  if (mode === 'verify-ca') {
    const ca = env.LEGACY_DB_SSL_CA
    if (!ca) throw new Error('LEGACY_DB_SSL=verify-ca requires LEGACY_DB_SSL_CA (PEM contents)')
    return { rejectUnauthorized: true, ca }
  }
  return { rejectUnauthorized: false }
}

// 'UTC' or a fixed UTC offset (`+HH:MM` / `-HH:MM`) within the real ±14:00 range.
const FIXED_OFFSET = /^[+-](?:0\d|1[0-4]):[0-5]\d$/

/**
 * Legacy MySQL DATETIME columns carry no zone, so the wall-clock strings the reader
 * returns are ambiguous until an operator tells us which zone the legacy app wrote
 * them in. Defaulting to UTC preserves today's behaviour; a wrong non-default value
 * would shift every published_at, so only exact 'UTC' or a fixed offset is accepted
 * (named IANA zones are rejected because resolving them needs DST-aware rules we do
 * not apply). Getting this wrong is silently corrupting, so an unparseable value throws.
 */
export function legacyTimezone(env: NodeJS.ProcessEnv): string {
  const tz = env.LEGACY_DB_TIMEZONE ?? 'UTC'
  if (tz === 'UTC') return tz
  if (!FIXED_OFFSET.test(tz)) {
    throw new Error(`Invalid LEGACY_DB_TIMEZONE "${tz}" (expected 'UTC' or a fixed offset like '+08:00')`)
  }
  return tz
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const req = (k: string) => {
    const v = env[k]
    if (!v) throw new Error(`Missing env ${k}`)
    return v
  }
  const ssl = legacySsl(env)
  return {
    legacy: {
      host: req('LEGACY_DB_HOST'),
      port: Number(env.LEGACY_DB_PORT ?? 3306),
      database: env.LEGACY_DB_DATABASE ?? 'kinnso',
      user: req('LEGACY_DB_USERNAME'),
      password: req('LEGACY_DB_PASSWORD'),
      // Omit the key entirely for `disable` — mysql2 treats `ssl: undefined` as "no TLS",
      // but spelling it out keeps the plaintext case obvious at the call site.
      ...(ssl ? { ssl } : {}),
      sslMode: (env.LEGACY_DB_SSL ?? 'require') as LegacySslMode,
    },
    supabaseUrl: req('SUPABASE_URL'),
    serviceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
    cdnBase: (env.CDN_BASE_URL ?? '').replace(/\/$/, ''),
    legacyTimezone: legacyTimezone(env),
  }
}
