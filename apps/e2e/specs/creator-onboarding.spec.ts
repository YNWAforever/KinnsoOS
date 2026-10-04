import { test, expect } from '@playwright/test'

/**
 * Full creator onboarding journey, hermetic via apps/scan SCAN_FIXTURE_MODE=1.
 *
 * Pre-reqs (started manually — see the README run block):
 *  - apps/scan running in fixture mode on :8788
 *  - apps/web running on :3000 with NEXT_PUBLIC_SCAN_URL=http://localhost:8788
 *  - the Supabase project reachable by apps/web (local stack or the shared hosted one)
 *
 * SP1 lesson: use a disjoint, timestamped identifier so concurrent runs never collide,
 * and rely on per-user RLS so we only ever touch our own rows.
 */
const STAMP = Date.now()
const EMAIL = `e2e+onboarding-${STAMP}@kinnso.test`
const PASSWORD = `E2e!${STAMP}aA`
const allowExternalScanSkip = process.env.E2E_ALLOW_EXTERNAL_SCAN_SKIP === 'true'

test('creator signs up, adds handles, scans, reviews DNA, publishes, reads back', async ({
  page,
}) => {
  // The post-deploy gate (verify.yml) runs this against LIVE prod, where the scan step hits
  // the REAL scan (Railway worker + RapidAPI + LLM) and can run well past a minute. Give the
  // whole journey headroom beyond the global 120s CI test timeout.
  test.setTimeout(process.env.CI ? 240_000 : 60_000)

  // 1. Sign up (Plan 1b form). Adjust selectors to the Plan 1b labels if they differ.
  await page.goto('/en/sign-up')
  await page.getByLabel(/email/i).fill(EMAIL)
  await page.getByLabel(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /sign up|create account/i }).click()

  // Land on the gated wizard. Brand-new creators first see a welcome/orientation
  // screen — click through it to reach the handles step.
  await page.waitForURL(/\/en\/creator/, { timeout: 30_000 })
  await page.getByRole('button', { name: /get started/i }).click()
  await expect(page.getByRole('heading', { name: /add your social handles/i })).toBeVisible()

  // 2. Add one Instagram handle and run the scan.
  await page.getByPlaceholder(/handle or profile url/i).first().fill('travel.hk')
  await page.getByRole('button', { name: /run scan/i }).click()

  // 3. Live progress -> review. Hermetic (fixture) runs reach this in seconds. The
  // post-deploy gate runs against LIVE prod, where this exercises the REAL scan, which is
  // non-deterministic in BOTH latency and availability. Wait generously for the review
  // heading. Only the explicit deployed-live opt-in may treat an upstream outage as a
  // skip; fixture-backed PR CI must fail when review is not reached.
  const reviewHeading = page.getByRole('heading', { name: /review your creator dna/i })
  const scanDidNotComplete = page
    .getByRole('button', { name: /retry scan/i })
    .or(
      page.getByText(
        /the scan failed|scanned too recently|session expired|something went wrong starting the scan|scanning is temporarily unavailable/i,
      ),
    )

  let reviewReady = false
  try {
    await expect(reviewHeading.or(scanDidNotComplete)).toBeVisible({ timeout: 150_000 })
    reviewReady = await reviewHeading.isVisible()
  } catch {
    reviewReady = false
  }
  test.skip(
    !reviewReady && allowExternalScanSkip,
    'Upstream scan (Railway worker / RapidAPI / LLM) did not complete — external dependency, not a deploy regression.',
  )
  expect(reviewReady, 'Fixture-backed creator scan must reach review').toBe(true)

  // 4. Edit the bio and publish.
  const bio = page.getByLabel(/^bio$/i)
  await bio.fill('E2E travel creator')
  await page.getByRole('button', { name: /publish profile/i }).click()

  // 5. Read-back screen shows the published DNA.
  await expect(page.getByRole('heading', { name: /your profile is live/i })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('E2E travel creator')).toBeVisible()

  // Reloading the gated page resumes to read-back (creators.status === 'active').
  await page.reload()
  await expect(page.getByRole('heading', { name: /your profile is live/i })).toBeVisible()
})
