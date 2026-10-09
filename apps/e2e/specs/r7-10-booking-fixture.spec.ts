import { expect, test } from '@playwright/test'
import { assertBookingFixturePage, assertBookingFixtureProjection } from '../r7-10-booking-fixture'
import { FIXTURES } from '../fixtures'

test('booking readiness rejects the real missing experience 404 before keyboard work', async ({ page }) => {
  const response = await page.goto('/en/experiences/r7-missing-experience')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(assertBookingFixturePage(page, response)).rejects.toThrow(/HTTP 200/)
})

test('booking readiness rejects a synthetic HTTP 200 shell with the wrong heading', async ({ page }) => {
  // This negative control is synthetic; it cannot establish hosted acceptance.
  await page.route('**/en/experiences/r7-readiness-shell', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<h1>404 — Not found</h1>',
  }))
  const response = await page.goto('/en/experiences/r7-readiness-shell')
  expect(response?.status()).toBe(200)
  await expect(assertBookingFixturePage(page, response)).rejects.toThrow(/R7 Smoke Tokyo Experience/)
})

test('booking readiness accepts the actual anonymous seeded experience', async ({ page }, testInfo) => {
  await assertBookingFixtureProjection(testInfo)
  const response = await page.goto(FIXTURES.seoEntities.experiencePath)
  await assertBookingFixturePage(page, response)
})
