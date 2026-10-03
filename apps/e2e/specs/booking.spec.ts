import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

/**
 * Full guest booking funnel against Stripe TEST MODE. Requires the target
 * deployment to have real Stripe test-mode keys configured (STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET) and a webhook endpoint reachable from Stripe (the
 * deployed preview/prod URL, or `stripe listen --forward-to
 * localhost:3000/api/stripe/webhook` for local runs). Uses Stripe's documented
 * test card 4242 4242 4242 4242 (any future expiry, any CVC, any postal code).
 * ALSO requires the fixture experience to have at least one open, future,
 * non-full experience_availability row — as of 2026-07-04 none of the 5
 * published experiences have any (a content/ops gap, not a code gap).
 */
test('guest books an experience end-to-end via Stripe test-mode checkout', async ({ page }) => {
  test.setTimeout(process.env.CI ? 180_000 : 60_000)

  await page.goto(FIXTURES.booking.experiencePath)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.getByLabel('Choose a date').selectOption({ index: 0 })
  await page.getByLabel('Email').fill(`e2e+booking-${Date.now()}@kinnso.test`)
  await page.getByRole('button', { name: 'Book now' }).click()

  // Redirected to Stripe's hosted Checkout page (different origin).
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  const cardFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await cardFrame.locator('input[name="number"]').fill('4242424242424242')
  await cardFrame.locator('input[name="expiry"]').fill('12/34')
  await cardFrame.locator('input[name="cvc"]').fill('123')
  await page.getByRole('button', { name: /pay/i }).click()

  // Stripe redirects back to our success_url once payment completes.
  await page.waitForURL(/\/experiences\/.+\/booked\?session_id=/, { timeout: 30_000 })
  // The webhook may not have landed yet on first paint — allow one manual refresh.
  const confirmed = page.getByRole('heading', { name: "You're booked!" })
  const pending = page.getByRole('heading', { name: 'Confirming your payment…' })
  await expect(confirmed.or(pending)).toBeVisible({ timeout: 15_000 })
  if (await pending.isVisible()) {
    await page.getByRole('link', { name: 'Refresh' }).click()
    await expect(confirmed).toBeVisible({ timeout: 15_000 })
  }
})
