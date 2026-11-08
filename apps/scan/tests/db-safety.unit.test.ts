import { afterEach, expect, it, vi } from 'vitest'
import * as vitest from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => { throw new Error('CLIENT_CREATED') }) }))
const { docker, suite, hook } = vi.hoisted(() => ({ docker: vi.fn(), suite: vi.fn(), hook: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), execFileSync: docker }))
vi.doMock('vitest', () => ({ ...vitest, describe: suite, beforeAll: hook, afterAll: hook }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); createClient.mockClear(); docker.mockReset(); suite.mockClear(); hook.mockClear() })

it.each(['default', 'cloud', 'missing credentials'])('blocks %s before any scan client or hook', async (mode) => {
  vi.stubEnv('KINNSO_RUN_WORKER_DB_TESTS', mode === 'default' ? '' : '1')
  vi.stubEnv('KINNSO_WORKER_TEST_DATA', 'synthetic')
  vi.stubEnv('SUPABASE_URL', mode === 'cloud' ? 'https://unapproved.supabase.co' : 'http://127.0.0.1:54421')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', mode === 'missing credentials' ? '' : 'unverified')
  vi.stubEnv('SUPABASE_ANON_KEY', 'unverified')
  await expect(import('./scan.integration.test')).rejects.toThrow('BLOCKED')
  expect(createClient).not.toHaveBeenCalled()
})

it.each(['host', 'context', 'implicit context', 'namespace unavailable'])('rejects remote/unproven Docker %s before scan clients or hooks', async (selection) => {
  const project = 'kinnsoos-pilot-20261013'
  for (const [key, value] of Object.entries({
    KINNSO_RUN_WORKER_DB_TESTS: '1', KINNSO_WORKER_TEST_DATA: 'synthetic',
    KINNSO_TEST_TARGET: 'local', KINNSO_TEST_PROJECT: project,
    KINNSO_TEST_API_ORIGIN: 'http://127.0.0.1:58421', SUPABASE_URL: 'http://127.0.0.1:58421',
    KINNSO_TEST_DB_CONTAINER: 'supabase_db_' + project, SUPABASE_DB_CONTAINER: 'supabase_db_' + project,
    SUPABASE_ANON_KEY: 'synthetic-unverified', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-unverified',
    KINNSO_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '', KINNSO_APPROVED_SUPABASE_ORIGIN: '', KINNSO_LEGACY_AUTH_ORIGIN: '',
    DOCKER_HOST: selection === 'host' ? 'ssh://remote.invalid' : '', DOCKER_CONTEXT: selection === 'context' ? 'remote' : '',
  })) vi.stubEnv(key, value)
  docker.mockImplementation((command: string, args: string[]) => {
    if (command === 'python3') throw new Error('synthetic namespace mismatch')
    if (args[0] !== 'context') throw new Error('UNEXPECTED_DOCKER_INSPECTION')
    if (args[1] === 'show') return 'selected'
    return JSON.stringify([{ Name: args[2], Endpoints: { docker: { Host: selection === 'namespace unavailable' ? 'unix:///var/run/docker.sock' : 'ssh://remote.invalid' } } }])
  })
  await expect(import('./scan.integration.test')).rejects.toThrow('BLOCKED')
  if (selection !== 'host') expect(docker).toHaveBeenCalled()
  expect(createClient).not.toHaveBeenCalled()
  expect(suite).not.toHaveBeenCalled()
  expect(hook).not.toHaveBeenCalled()
})
