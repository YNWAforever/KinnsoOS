/**
 * Answers one question before a deploy: can this environment actually reach the
 * legacy MySQL server, and under which TLS mode?
 *
 * `LEGACY_DB_SSL` defaults to `require`. That is the right default — plaintext
 * would put the credentials and every article body on the wire — but it is a
 * guess about a server this repository cannot see. Rather than discovering the
 * answer when sync starts failing, run:
 *
 *   pnpm --filter @kinnso/sync preflight
 *
 * It tries the configured mode, and if TLS is what failed it retries with TLS
 * off purely to distinguish "this server has no TLS" from "this server is
 * unreachable" — it never changes configuration, only reports.
 *
 * Exit codes: 0 the configured mode works; 1 it does not.
 */
import mysql from 'mysql2/promise'
import { legacySsl, type LegacySslMode } from './config'
import { diagnoseLegacyConnectionError } from './diagnose'

type Target = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function readTarget(env: NodeJS.ProcessEnv): Target {
  const req = (k: string): string => {
    const v = env[k]
    if (!v) throw new Error(`Missing env ${k}`)
    return v
  }
  return {
    host: req('LEGACY_DB_HOST'),
    port: Number(env.LEGACY_DB_PORT ?? 3306),
    user: req('LEGACY_DB_USERNAME'),
    password: req('LEGACY_DB_PASSWORD'),
    database: env.LEGACY_DB_DATABASE ?? 'kinnso',
  }
}

async function tryConnect(
  target: Target,
  ssl: ReturnType<typeof legacySsl>,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  let conn: mysql.Connection | undefined
  try {
    conn = await mysql.createConnection({
      ...target,
      connectTimeout: 10_000,
      ...(ssl ? { ssl } : {}),
    })
    await conn.query('select 1')
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  } finally {
    await conn?.end().catch(() => {})
  }
}

export async function preflight(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const target = readTarget(env)
  const mode = (env.LEGACY_DB_SSL ?? 'require') as LegacySslMode
  // Throws on an invalid mode / missing CA before any network work.
  const ssl = legacySsl(env)

  process.stdout.write(
    `Connecting to ${target.host}:${target.port}/${target.database} with LEGACY_DB_SSL=${mode}\n`,
  )

  const first = await tryConnect(target, ssl)
  if (first.ok) {
    process.stdout.write(`OK — the legacy server accepts LEGACY_DB_SSL=${mode}.\n`)
    if (mode === 'require') {
      process.stdout.write(
        'Note: `require` encrypts but does not verify the certificate. Once you have the ' +
          "server's CA, LEGACY_DB_SSL=verify-ca plus LEGACY_DB_SSL_CA is the only mode that " +
          'also stops an active MITM.\n',
      )
    }
    if (mode === 'disable') {
      process.stdout.write(
        'Warning: this connection is plaintext. Credentials and article bodies are readable ' +
          'by anything on the network path.\n',
      )
    }
    return 0
  }

  const diagnosis = diagnoseLegacyConnectionError(first.error, mode)
  process.stderr.write(`FAILED — ${diagnosis.message}\n`)

  // Only worth distinguishing when TLS is the suspect and it was actually on.
  if (diagnosis.tlsRelated && mode !== 'disable') {
    const plaintext = await tryConnect(target, undefined)
    process.stderr.write(
      plaintext.ok
        ? 'Confirmed: the same server accepts a PLAINTEXT connection, so it has no usable TLS. ' +
          'Enable TLS on that server, or set LEGACY_DB_SSL=disable if the path is already a ' +
          'trusted private network.\n'
        : 'The server also refused a plaintext connection, so this is more likely reachability ' +
          'or credentials than TLS.\n',
    )
  }
  return 1
}

const isEntrypoint = process.argv[1]?.endsWith('preflight.ts')
if (isEntrypoint) {
  preflight()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`${(err as Error).message}\n`)
      process.exit(1)
    })
}
