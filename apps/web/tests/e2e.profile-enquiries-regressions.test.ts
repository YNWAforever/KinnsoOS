import { describe, expect, it, vi } from 'vitest'
import {
  PROFILE_ENQUIRIES_LOCAL_OPT_IN,
  profileEnquiryRateBucketHash,
  resolveProfileEnquiriesLocalConfig,
} from '../../e2e/profile-enquiries-local'
import { cleanupOwnedEnquiries } from '../../e2e/profile-enquiries-cleanup'

const safeEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  [PROFILE_ENQUIRIES_LOCAL_OPT_IN]: '1',
  E2E_BASE_URL: 'http://127.0.0.1:3000',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
  SUPABASE_DB_CONTAINER: 'supabase_db_test',
}

async function importDedicatedConfig(env: NodeJS.ProcessEnv) {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }
  try {
    vi.resetModules()
    return await import('../../e2e/playwright.profile-enquiries.config')
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('profile enquiries Playwright isolation', () => {
  it('rejects missing opt-in before a local config is available', () => {
    const withoutOptIn = { ...safeEnv }
    delete withoutOptIn[PROFILE_ENQUIRIES_LOCAL_OPT_IN]
    expect(() => resolveProfileEnquiriesLocalConfig(withoutOptIn)).toThrow(`${PROFILE_ENQUIRIES_LOCAL_OPT_IN}=1 is required`)
  })

  it.each([
    ['remote browser base URL', { ...safeEnv, E2E_BASE_URL: 'https://example.test' }],
    ['remote Supabase URL', { ...safeEnv, SUPABASE_URL: 'https://example.supabase.co' }],
  ])('rejects a %s', (_label, env) => {
    expect(() => resolveProfileEnquiriesLocalConfig(env)).toThrow('must be an http loopback URL')
  })

  it('accepts a complete loopback-only config', () => {
    expect(resolveProfileEnquiriesLocalConfig(safeEnv)).toMatchObject({
      baseURL: safeEnv.E2E_BASE_URL,
      supabaseUrl: safeEnv.SUPABASE_URL,
      dbContainer: safeEnv.SUPABASE_DB_CONTAINER,
    })
  })

  it('imports the dedicated config under a safe environment and scopes a fresh server to the profile spec', async () => {
    const configModule = await importDedicatedConfig(safeEnv)
    const config = configModule.default as unknown as {
      testMatch: string
      webServer: { reuseExistingServer: boolean }
    }

    expect(config.testMatch).toBe('profile-enquiries.spec.ts')
    expect('profile-enquiries.spec.ts').toMatch(config.testMatch)
    expect('journey.spec.ts').not.toMatch(config.testMatch)
    expect(config.webServer.reuseExistingServer).toBe(false)
  })

  it('derives the cleanup bucket with the exact keyed and domain-separated HMAC', () => {
    expect(profileEnquiryRateBucketHash('203.0.113.77')).toBe(
      'e43a26ab0bf95ebe4b48e9dba384d83643825a940ffdf0992bca18b3adf9ab7e',
    )
  })

  it('deletes a creator-only submission discovered during teardown when normal ID capture never ran', async () => {
    const trackedIds: string[] = []
    const calls: string[] = []
    const result = await cleanupOwnedEnquiries(
      async (emails) => {
        expect(emails).toEqual(['creator@example.test', 'merchant@example.test'])
        return { data: [{ id: 'creator-enquiry-id' }], error: null }
      },
      ['creator@example.test', 'merchant@example.test'],
      trackedIds,
      async (ids) => { calls.push(`audit:${ids.join(',')}`); return { error: null } },
      async (ids) => { calls.push(`enquiries:${ids.join(',')}`); return { error: null } },
    )

    expect(trackedIds).toEqual(['creator-enquiry-id'])
    expect(calls).toEqual(['audit:creator-enquiry-id', 'enquiries:creator-enquiry-id'])
    expect(result.errors).toEqual([])
  })

  it('continues to enquiry deletion when audit deletion returns an error', async () => {
    const calls: string[] = []
    const result = await cleanupOwnedEnquiries(
      async () => ({ data: [{ id: 'creator-enquiry-id' }], error: null }),
      ['creator@example.test'],
      [],
      async (ids) => { calls.push(`audit:${ids.join(',')}`); return { error: new Error('audit denied') } },
      async (ids) => { calls.push(`enquiries:${ids.join(',')}`); return { error: null } },
    )

    expect(calls).toEqual(['audit:creator-enquiry-id', 'enquiries:creator-enquiry-id'])
    expect(result.errors).toEqual(['enquiry audit rows: audit denied'])
  })

  it('uses tracked IDs and continues both deletions when discovery fails', async () => {
    const calls: string[] = []
    const result = await cleanupOwnedEnquiries(
      async () => ({ data: null, error: new Error('lookup failed') }),
      ['creator@example.test'],
      ['already-tracked-id'],
      async (ids) => { calls.push(`audit:${ids.join(',')}`); return { error: null } },
      async (ids) => { calls.push(`enquiries:${ids.join(',')}`); return { error: null } },
    )

    expect(calls).toEqual(['audit:already-tracked-id', 'enquiries:already-tracked-id'])
    expect(result.errors).toEqual(['discover run-owned enquiries: lookup failed'])
  })
})