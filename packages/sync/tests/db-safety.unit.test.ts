import { afterEach, expect, it, vi } from 'vitest'
import * as vitest from 'vitest'
import { createHmac } from 'node:crypto'

const { createClient, createPool } = vi.hoisted(() => ({
  createClient: vi.fn(() => { throw new Error('CLIENT_CREATED') }),
  createPool: vi.fn(() => { throw new Error('POOL_CREATED') }),
}))
const { docker, suite, hook } = vi.hoisted(() => ({ docker: vi.fn(), suite: vi.fn(), hook: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('mysql2/promise', () => ({ default: { createPool } }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), execFileSync: docker }))
vi.doMock('vitest', () => ({ ...vitest, describe: suite, beforeAll: hook, afterAll: hook }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); createClient.mockClear(); createPool.mockClear(); docker.mockReset(); suite.mockClear(); hook.mockClear() })

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

it.each(['host', 'context', 'implicit context', 'namespace unavailable'])('rejects remote/unproven Docker %s before sync/reader clients or hooks', async (selection) => {
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
  await expect(import('./sync.integration.test')).rejects.toThrow('BLOCKED')
  await expect(import('./reader.contract.test')).rejects.toThrow('BLOCKED')
  if (selection !== 'host') expect(docker).toHaveBeenCalled()
  expect(createClient).not.toHaveBeenCalled()
  expect(createPool).not.toHaveBeenCalled()
  expect(suite).not.toHaveBeenCalled()
  expect(hook).not.toHaveBeenCalled()
})

it('reader rechecks Docker after Supabase attestation and rejects a switched context before pools or hooks', async () => {
  const { runtimeFixture, targetEnv } = await vi.importActual<{
    runtimeFixture: () => { containers: { Config: { Env: string[] } }[]; run: (command: string, args: string[]) => string }
    targetEnv: () => Record<string, string>
  }>('../../../apps/journeys/tests/helpers/target-runtime.mjs')
  const fixture = runtimeFixture()
  const secret = 'synthetic-offline-only-worker-signing-secret'
  const jwt = (role: string) => {
    const message = Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ role })).toString('base64url')
    return message + '.' + createHmac('sha256', secret).update(message).digest('base64url')
  }
  fixture.containers[3].Config.Env.push('GOTRUE_JWT_SECRET=' + secret)
  fixture.containers[2].Config.Env.push('PGRST_JWT_SECRET=' + secret)
  for (const [key, value] of Object.entries({
    ...targetEnv(), SUPABASE_DB_CONTAINER: targetEnv().KINNSO_TEST_DB_CONTAINER,
    KINNSO_RUN_WORKER_DB_TESTS: '1', KINNSO_WORKER_TEST_DATA: 'synthetic',
    SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
    KINNSO_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '', KINNSO_APPROVED_SUPABASE_ORIGIN: '', KINNSO_LEGACY_AUTH_ORIGIN: '',
    DOCKER_HOST: '', DOCKER_CONTEXT: '', LEGACY_DB_HOST: '127.0.0.1', LEGACY_DB_PORT: '58432',
    LEGACY_DB_DATABASE: 'kinnso_sync_test', LEGACY_DB_USERNAME: 'kinnso_test', LEGACY_DB_PASSWORD: 'synthetic-only', LEGACY_DB_SSL: 'disable',
  })) vi.stubEnv(key, value)
  let proofs = 0
  docker.mockImplementation((command: string, args: string[]) => {
    if (command === 'python3') {
      if (++proofs === 2) vi.stubEnv('DOCKER_CONTEXT', 'remote')
      return JSON.stringify({ endpoint: 'unix:///var/run/docker.sock', socket: [1, 2], peer: [123], namespace: 'net:[789]', mode: 'native' })
    }
    if (args[0] === 'context') {
      if (args[1] === 'show') return 'local'
      return JSON.stringify([{ Name: args[2], Endpoints: { docker: { Host: args[2] === 'remote' ? 'ssh://remote.invalid' : 'unix:///var/run/docker.sock' } } }])
    }
    expect(args.slice(0, 2)).toEqual(['--host', 'unix:///var/run/docker.sock'])
    return fixture.run(command, args.slice(2))
  })
  await expect(import('./reader.contract.test')).rejects.toThrow('BLOCKED')
  expect(proofs).toBe(2)
  expect(docker.mock.calls.some(([, args]) => args[0] === 'context' && args[2] === 'remote')).toBe(true)
  expect(createClient).not.toHaveBeenCalled()
  expect(createPool).not.toHaveBeenCalled()
  expect(suite).not.toHaveBeenCalled()
  expect(hook).not.toHaveBeenCalled()
})
