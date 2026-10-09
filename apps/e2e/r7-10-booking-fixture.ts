import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { expect, type Page, type Response, type TestInfo } from '@playwright/test'
import { resolveR710LocalConfig } from './r7-10-local'

const EXPERIENCE_ID = '00000000-0000-0000-0000-000000000704'
const MERCHANT_ID = '00000000-0000-0000-0000-000000000705'

/** Fail at navigation, rather than accepting a branded 404 and waiting for a date control. */
export async function assertBookingFixturePage(page: Page, response: Response | null) {
  expect(response?.status(), 'seeded booking fixture must return HTTP 200').toBe(200)
  await expect(page.getByRole('heading', {
    level: 1, name: 'R7 Smoke Tokyo Experience', exact: true,
  })).toBeVisible()
}

/** Anonymous, bounded reads only. Never reseed, use service-role access, or alter grants. */
export async function assertBookingFixtureProjection(testInfo: TestInfo) {
  const local = resolveR710LocalConfig(process.env)
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  expect(sourceSha).toMatch(/^[a-f0-9]{40}$/)
  const anonymous = createClient(local.supabaseUrl, local.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [experience, merchant, availability] = await Promise.all([
    anonymous.from('experiences').select('id, merchant_profile_id, title')
      .eq('slug', 'r7-smoke-tokyo-experience')
      .abortSignal(AbortSignal.timeout(15_000)).maybeSingle(),
    anonymous.from('merchant_public_profiles').select('id')
      .eq('id', MERCHANT_ID).abortSignal(AbortSignal.timeout(15_000)).maybeSingle(),
    anonymous.from('experience_availability').select('id')
      .eq('experience_id', EXPERIENCE_ID).eq('status', 'open')
      .gte('date', new Date().toISOString().slice(0, 10)).limit(1)
      .abortSignal(AbortSignal.timeout(15_000)),
  ])
  const proof = {
    sourceSha, supabaseOrigin: local.supabaseUrl, scope: 'ANONYMOUS_LOCAL_READS_ONLY',
    checks: {
      experience: !experience.error && experience.data?.id === EXPERIENCE_ID
        && experience.data?.merchant_profile_id === MERCHANT_ID
        && experience.data?.title === 'R7 Smoke Tokyo Experience',
      merchant: !merchant.error && merchant.data?.id === MERCHANT_ID,
      availability: !availability.error && availability.data?.length === 1,
    },
    // Keep raw SQL, credentials and provider response messages out of artifacts.
    errors: [experience, merchant, availability].map(result => result.error
      ? (/^[A-Z0-9_]{1,32}$/.test(result.error.code ?? '') ? result.error.code : 'READ_FAILED')
      : null),
  }
  await testInfo.attach('booking-fixture-projection', {
    body: JSON.stringify(proof), contentType: 'application/json',
  })
  expect(proof.checks, 'anonymous local experience, merchant and future availability must be ready')
    .toEqual({ experience: true, merchant: true, availability: true })
}
