import { expect, test } from '@playwright/test'
import { E2E_DEFAULT_BASE_URL, E2E_REMOTE_TARGET_OPT_IN, resolveE2EBaseURL } from '../e2e-target'

// The guard is the only thing standing between a bare `pnpm --filter @kinnso/e2e e2e` and
// a suite that signs up users and publishes profiles, so pin its exact behaviour here
// rather than relying on the deployment workflows to notice a regression.
test('the shared Playwright target defaults to loopback', () => {
  expect(resolveE2EBaseURL({})).toBe(E2E_DEFAULT_BASE_URL)
  expect(resolveE2EBaseURL({ E2E_BASE_URL: '  ' })).toBe(E2E_DEFAULT_BASE_URL)
})

test('the shared Playwright target accepts every loopback spelling without an opt-in', () => {
  for (const baseURL of [
    'http://127.0.0.1:3100',
    'http://localhost:3000',
    'http://[::1]:3000',
    'https://localhost:3000',
  ]) {
    expect(resolveE2EBaseURL({ E2E_BASE_URL: baseURL })).toBe(baseURL)
  }
})

test('the shared Playwright target refuses a remote host until it is explicitly allowed', () => {
  const remote = 'https://remix-kinnso-web.vercel.app'

  expect(() => resolveE2EBaseURL({ E2E_BASE_URL: remote })).toThrow(E2E_REMOTE_TARGET_OPT_IN)
  expect(() => resolveE2EBaseURL({ E2E_BASE_URL: remote, [E2E_REMOTE_TARGET_OPT_IN]: 'true' }))
    .toThrow(E2E_REMOTE_TARGET_OPT_IN)
  expect(resolveE2EBaseURL({ E2E_BASE_URL: remote, [E2E_REMOTE_TARGET_OPT_IN]: '1' })).toBe(remote)
})

test('the shared Playwright target rejects a value that is not an absolute URL', () => {
  expect(() => resolveE2EBaseURL({ E2E_BASE_URL: '/en/explore' })).toThrow('must be an absolute URL')
})
