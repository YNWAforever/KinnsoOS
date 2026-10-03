import { describe, expect, it } from 'vitest'
import { diagnoseLegacyConnectionError } from '../src/diagnose'

describe('diagnoseLegacyConnectionError', () => {
  it('names LEGACY_DB_SSL=disable when the server has no TLS at all', () => {
    const d = diagnoseLegacyConnectionError(
      { code: 'HANDSHAKE_NO_SSL_SUPPORT', message: 'Server does not support secure connection' },
      'require',
    )
    expect(d.tlsRelated).toBe(true)
    expect(d.message).toContain('LEGACY_DB_SSL=disable')
    // The safer remedy must be offered first — disabling TLS is the fallback.
    expect(d.message.indexOf('enable TLS')).toBeLessThan(d.message.indexOf('LEGACY_DB_SSL=disable'))
  })

  it('recognises the no-TLS case from the driver message alone', () => {
    const d = diagnoseLegacyConnectionError(
      new Error('Server does not support secure connection'),
      'require',
    )
    expect(d.tlsRelated).toBe(true)
  })

  it('points verify-ca failures at the CA variable rather than at disabling TLS', () => {
    const d = diagnoseLegacyConnectionError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }, 'verify-ca')
    expect(d.tlsRelated).toBe(true)
    expect(d.message).toContain('LEGACY_DB_SSL_CA')
    expect(d.message).not.toContain('LEGACY_DB_SSL=disable')
  })

  it('treats a TLS protocol mismatch as a port/TLS problem', () => {
    const d = diagnoseLegacyConnectionError(
      { code: 'EPROTO', message: 'wrong version number' },
      'require',
    )
    expect(d.tlsRelated).toBe(true)
    expect(d.message).toContain('LEGACY_DB_PORT')
  })

  it('does not blame TLS for an unreachable host', () => {
    const d = diagnoseLegacyConnectionError(
      { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' },
      'require',
    )
    expect(d.tlsRelated).toBe(false)
    expect(d.message).toContain('does not')
    expect(d.message).toContain('credentials')
  })

  it('does not blame TLS for bad credentials', () => {
    const d = diagnoseLegacyConnectionError(
      { code: 'ER_ACCESS_DENIED_ERROR', message: "Access denied for user 'x'@'y'" },
      'disable',
    )
    expect(d.tlsRelated).toBe(false)
  })

  it('always carries the underlying driver error through', () => {
    const d = diagnoseLegacyConnectionError({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' }, 'require')
    expect(d.message).toContain('connect ETIMEDOUT')
  })
})
