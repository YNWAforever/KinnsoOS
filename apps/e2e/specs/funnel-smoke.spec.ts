import { test, expect } from '@playwright/test'
import { findAttributedExperience, findPublishedGuideLinks } from '../funnel-guide'

const bookingLive = process.env.BOOKING_LIVE === 'true'

test.beforeEach(async ({ page }) => {
  if (!bookingLive) {
    // Keep anonymous remote smoke runs read-only even if page scripts attempt a write.
    await page.route('**/*', route => route.request().method() === 'GET'
      ? route.continue()
      : route.abort('blockedbyclient'))
  }
})

test('home to a published guide to its linked experience', async ({ page }) => {
  const homeResponse = await page.goto('/en')
  expect(homeResponse?.status(), 'home should return HTTP 200').toBe(200)
  await expect(page.locator('h1')).toBeVisible()

  const guideLinks = await findPublishedGuideLinks(page)
  test.skip(
    guideLinks.length === 0,
    'PILOT_EMPTY: no published /en/g/ guides are available; guide-to-experience funnel not exercised.',
  )

  const experienceHref = await findAttributedExperience(page, guideLinks)
  const experienceResponse = await page.goto(experienceHref as string)
  expect(experienceResponse?.status(), `${experienceHref} should return HTTP 200`).toBe(200)
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('body')).toContainText(/(?:HKD|USD|SGD|JPY|KRW|THB|TWD|CNY)\s*[\d,]+/)

  if (bookingLive) {
    await page.locator('#booking-email').fill('r7-smoke@example.com')
    await page.getByRole('button', { name: /book now/i }).click()
    await page.waitForURL('https://checkout.stripe.com/**', { timeout: 30_000 })
  }
})

test('anonymous KinnsoOS navigation uses traveller-first entry points', async ({ page }) => {
  const homeResponse = await page.goto('/en')
  expect(homeResponse?.status(), 'home should return HTTP 200').toBe(200)

  // Local R7.10 builds apps/web Navbar; Nightly/synthetic pilot chrome uses Workbench links.
  const links = process.env.R7_10_LOCAL === '1'
    ? [
        ['Explore', '/en/explore'],
        ['For Creators', '/en/for-creators'],
        ['For Merchants', '/en/for-merchants'],
        ['Sign in', '/en/sign-in'],
        ['Sign up', '/en/sign-up'],
      ] as const
    : [
        ['Explore', '/en/explore'],
        ['My trips', '/en/trips'],
        ['Record', '/en/record'],
        ['For creators', '/en/studio'],
        ['For business', '/en/merchants/dashboard'],
      ] as const

  const header = page.getByRole('banner')
  for (const [name, href] of links) {
    await expect(header.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }
})
