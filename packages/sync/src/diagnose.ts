import type { LegacySslMode } from './config'

/**
 * Turns a MySQL connection failure into something an operator can act on.
 *
 * `LEGACY_DB_SSL` defaults to `require`, which is the safe default but the wrong
 * one for a legacy server with no TLS at all. mysql2 reports that case as
 * "Server does not support secure connection" with no hint that a single env var
 * fixes it, and a TLS failure otherwise looks identical to the DB being down.
 * Naming the variable and the exact remedy is the difference between a two-minute
 * fix and an outage spent reading driver source.
 */
export type LegacyConnectionDiagnosis = {
  /** True when the failure is attributable to the TLS mode rather than the network or credentials. */
  tlsRelated: boolean
  message: string
}

type MysqlError = { code?: unknown; message?: unknown }

const codeOf = (err: unknown): string => {
  const raw = (err as MysqlError | null)?.code
  return typeof raw === 'string' ? raw : ''
}

const messageOf = (err: unknown): string => {
  const raw = (err as MysqlError | null)?.message
  return typeof raw === 'string' ? raw : String(err)
}

export function diagnoseLegacyConnectionError(
  err: unknown,
  mode: LegacySslMode,
): LegacyConnectionDiagnosis {
  const code = codeOf(err)
  const detail = messageOf(err)

  // The server refused to negotiate TLS at all — it has none configured.
  if (
    code === 'HANDSHAKE_NO_SSL_SUPPORT' ||
    /does not support secure connect/i.test(detail)
  ) {
    return {
      tlsRelated: true,
      message:
        `The legacy MySQL server has no TLS, but LEGACY_DB_SSL is "${mode}". ` +
        'Either enable TLS on that server (preferred — the credentials and every ' +
        'article body otherwise cross the network in cleartext), or set ' +
        'LEGACY_DB_SSL=disable if the connection is already confined to a trusted ' +
        `private network. Driver error: ${detail}`,
    }
  }

  // TLS was negotiated but the certificate could not be verified.
  if (
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'CERT_HAS_EXPIRED' ||
    /self.signed certificate|unable to verify|certificate has expired/i.test(detail)
  ) {
    return {
      tlsRelated: true,
      message:
        mode === 'verify-ca'
          ? 'LEGACY_DB_SSL=verify-ca could not verify the server certificate. Check that ' +
            `LEGACY_DB_SSL_CA holds the PEM that signed it. Driver error: ${detail}`
          : `The server certificate could not be verified under LEGACY_DB_SSL="${mode}". ` +
            `Driver error: ${detail}`,
    }
  }

  // A TLS-layer protocol mismatch — commonly a plaintext port being spoken TLS at.
  if (code === 'EPROTO' || /wrong version number|ssl routines/i.test(detail)) {
    return {
      tlsRelated: true,
      message:
        `TLS negotiation failed against the legacy server under LEGACY_DB_SSL="${mode}". ` +
        'This usually means the port is not speaking TLS. Confirm LEGACY_DB_PORT, or set ' +
        `LEGACY_DB_SSL=disable if that server genuinely has no TLS. Driver error: ${detail}`,
    }
  }

  return {
    tlsRelated: false,
    message:
      `Could not connect to the legacy MySQL server (LEGACY_DB_SSL="${mode}"). This does not ` +
      `look like a TLS problem — check host, port, credentials and network reachability. ` +
      `Driver error: ${detail}`,
  }
}
