const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

export const E2E_REMOTE_TARGET_OPT_IN = 'E2E_ALLOW_REMOTE_TARGET'
export const E2E_DEFAULT_BASE_URL = 'http://127.0.0.1:3000'

/**
 * Resolves the browser target for the shared Playwright config.
 *
 * The suite is not uniformly read-only: creator onboarding signs up a real auth user and
 * publishes a live profile, the booking journeys reach Stripe, and several forms insert
 * rows. A default that points at a deployed environment therefore turns a bare
 * `pnpm --filter @kinnso/e2e e2e` into a production mutation, so the default is loopback
 * and any other host needs a deliberate opt-in from the caller that owns that decision
 * (the post-deploy gate and the nightly synthetic, never a developer shell).
 *
 * Mirrors the requireLoopback guard in r7-10-local.ts: fail at config load, before a
 * browser exists, with a message that names the variable to set.
 */
export function resolveE2EBaseURL(env: NodeJS.ProcessEnv): string {
  const configured = env.E2E_BASE_URL?.trim()
  if (!configured) return E2E_DEFAULT_BASE_URL

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error(`E2E_BASE_URL must be an absolute URL (received ${JSON.stringify(configured)})`)
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (LOOPBACK.has(hostname)) return configured
  if (env[E2E_REMOTE_TARGET_OPT_IN] === '1') return configured

  throw new Error(
    `E2E_BASE_URL points at ${url.host}, which is not loopback. `
    + `Set ${E2E_REMOTE_TARGET_OPT_IN}=1 to run against a deployed target, and only with a `
    + 'spec selection that never mutates it (playwright.prod.config.ts).',
  )
}
