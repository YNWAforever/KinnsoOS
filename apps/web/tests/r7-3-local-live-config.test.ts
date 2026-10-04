import { describe, expect, it } from 'vitest'
import { resolveR73LocalLiveConfig } from './helpers/r7-3-local-live-config'

const complete = {
  RUN_R7_3_LOCAL_LIVE_TESTS: '1',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_DB_CONTAINER: 'supabase_db_kinnso-v3',
}

describe('R7.3 local live-test configuration', () => {
  it('fails closed without the dedicated opt-in even when generic production credentials exist', () => {
    expect(
      resolveR73LocalLiveConfig({
        ...complete,
        RUN_R7_3_LOCAL_LIVE_TESTS: undefined,
        SUPABASE_URL: 'https://production.supabase.co',
      }),
    ).toBeNull()
  })

  it('rejects a non-local URL even with explicit opt-in and complete credentials', () => {
    expect(resolveR73LocalLiveConfig({ ...complete, SUPABASE_URL: 'https://project.supabase.co' })).toBeNull()
  })

  it('rejects malformed URLs, local TLS URLs, and unsafe container names', () => {
    expect(resolveR73LocalLiveConfig({ ...complete, SUPABASE_URL: 'not-a-url' })).toBeNull()
    expect(resolveR73LocalLiveConfig({ ...complete, SUPABASE_URL: 'https://localhost:54321' })).toBeNull()
    expect(resolveR73LocalLiveConfig({ ...complete, SUPABASE_DB_CONTAINER: 'local;remote' })).toBeNull()
  })

  it('accepts an explicitly opted-in loopback Supabase stack', () => {
    expect(resolveR73LocalLiveConfig(complete)).toEqual({
      url: complete.SUPABASE_URL,
      anonKey: complete.SUPABASE_ANON_KEY,
      serviceRoleKey: complete.SUPABASE_SERVICE_ROLE_KEY,
      dbContainer: complete.SUPABASE_DB_CONTAINER,
    })
    expect(resolveR73LocalLiveConfig({ ...complete, SUPABASE_URL: 'http://[::1]:54321' })).not.toBeNull()
  })
})
