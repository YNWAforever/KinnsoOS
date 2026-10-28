import { afterEach, expect, it, vi } from 'vitest'

const { createClient, createPool } = vi.hoisted(() => ({
  createClient: vi.fn(() => { throw new Error('CLIENT_CREATED') }),
  createPool: vi.fn(() => { throw new Error('POOL_CREATED') }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('mysql2/promise', () => ({ default: { createPool } }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); createClient.mockClear(); createPool.mockClear() })

it.each(['default', 'cloud', 'missing credentials'])('blocks %s before sync clients or reader pools', async (mode) => {
  vi.stubEnv('KINNSO_RUN_WORKER_DB_TESTS', mode === 'default' ? '' : '1')
  vi.stubEnv('KINNSO_WORKER_TEST_DATA', 'synthetic')
  vi.stubEnv('SUPABASE_URL', mode === 'cloud' ? 'https://unapproved.supabase.co' : 'http://127.0.0.1:54421')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', mode === 'missing credentials' ? '' : 'unverified')
  vi.stubEnv('SUPABASE_ANON_KEY', 'unverified')
  await expect(import('./sync.integration.test')).rejects.toThrow('BLOCKED')
  await expect(import('./reader.contract.test')).rejects.toThrow('BLOCKED')
  expect(createClient).not.toHaveBeenCalled()
  expect(createPool).not.toHaveBeenCalled()
})
