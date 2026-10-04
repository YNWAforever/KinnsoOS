import { describe, expect, it } from 'vitest'
import { legacySsl, legacyTimezone, loadConfig } from '../src/config'

const baseEnv = {
  LEGACY_DB_HOST: 'legacy.example',
  LEGACY_DB_USERNAME: 'reader',
  LEGACY_DB_PASSWORD: 'secret',
  SUPABASE_URL: 'https://db.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}

describe('legacySsl', () => {
  it('defaults to encrypted (require) so credentials never fall back to cleartext', () => {
    expect(legacySsl({})).toEqual({ rejectUnauthorized: false })
    expect(legacySsl({ LEGACY_DB_SSL: 'require' })).toEqual({ rejectUnauthorized: false })
  })

  it('verifies the server certificate against the supplied CA in verify-ca mode', () => {
    expect(legacySsl({ LEGACY_DB_SSL: 'verify-ca', LEGACY_DB_SSL_CA: '-----BEGIN CERTIFICATE-----' }))
      .toEqual({ rejectUnauthorized: true, ca: '-----BEGIN CERTIFICATE-----' })
  })

  it('throws when verify-ca is requested without a CA (silently falling back would be worse)', () => {
    expect(() => legacySsl({ LEGACY_DB_SSL: 'verify-ca' })).toThrow(/LEGACY_DB_SSL_CA/)
  })

  it('returns undefined for the explicit disable opt-out so the key is omitted entirely', () => {
    expect(legacySsl({ LEGACY_DB_SSL: 'disable' })).toBeUndefined()
  })

  it('throws on an unknown mode rather than guessing', () => {
    expect(() => legacySsl({ LEGACY_DB_SSL: 'true' })).toThrow(/Invalid LEGACY_DB_SSL/)
    expect(() => legacySsl({ LEGACY_DB_SSL: 'REQUIRE' })).toThrow(/Invalid LEGACY_DB_SSL/)
  })
})

describe('legacyTimezone', () => {
  it('defaults to UTC (today\'s behaviour) and accepts fixed offsets', () => {
    expect(legacyTimezone({})).toBe('UTC')
    expect(legacyTimezone({ LEGACY_DB_TIMEZONE: '+08:00' })).toBe('+08:00')
    expect(legacyTimezone({ LEGACY_DB_TIMEZONE: '-05:30' })).toBe('-05:30')
  })

  it('rejects named zones and malformed offsets — a wrong value shifts every timestamp', () => {
    for (const tz of ['Asia/Hong_Kong', 'utc', '+8', '+08', '08:00', '+15:00', '+08:60']) {
      expect(() => legacyTimezone({ LEGACY_DB_TIMEZONE: tz })).toThrow(/Invalid LEGACY_DB_TIMEZONE/)
    }
  })
})

describe('loadConfig', () => {
  it('carries the resolved ssl options into the legacy connection config', () => {
    expect(loadConfig(baseEnv).legacy).toMatchObject({ host: 'legacy.example', ssl: { rejectUnauthorized: false } })
  })

  it('omits the ssl key entirely when TLS is explicitly disabled', () => {
    const { legacy } = loadConfig({ ...baseEnv, LEGACY_DB_SSL: 'disable' })
    expect('ssl' in legacy).toBe(false)
  })

  it('exposes the validated legacy timezone', () => {
    expect(loadConfig(baseEnv).legacyTimezone).toBe('UTC')
    expect(loadConfig({ ...baseEnv, LEGACY_DB_TIMEZONE: '+08:00' }).legacyTimezone).toBe('+08:00')
  })
})
