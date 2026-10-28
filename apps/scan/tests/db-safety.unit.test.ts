import { afterEach, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => { throw new Error('CLIENT_CREATED') }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); createClient.mockClear() })

it.each(['default', 'cloud', 'missing credentials'])('blocks %s before any scan client or hook', async (mode) => {
  vi.stubEnv('KINNSO_RUN_WORKER_DB_TESTS', mode === 'default' ? '' : '1')
  vi.stubEnv('KINNSO_WORKER_TEST_DATA', 'synthetic')
  vi.stubEnv('SUPABASE_URL', mode === 'cloud' ? 'https://unapproved.supabase.co' : 'http://127.0.0.1:54421')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', mode === 'missing credentials' ? '' : 'unverified')
  vi.stubEnv('SUPABASE_ANON_KEY', 'unverified')
  await expect(import('./scan.integration.test')).rejects.toThrow('BLOCKED')
  expect(createClient).not.toHaveBeenCalled()
})
