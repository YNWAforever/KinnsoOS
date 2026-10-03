import { test, expect } from '@playwright/test'
import { findAttributedExperience } from '../funnel-guide'

const bookingLive = process.env.BOOKING_LIVE === 'true'

test('home to a published guide to its linked experience', async ({ page }) => {
  const homeResponse = await page.goto('/en')
  expect(homeResponse?.status(), 'home should return HTTP 200').toBe(200)
  await expect(page.locator('body')).toContainText(/featured/i)

  const guideLinks = await page.locator('a[href^="/en/g/"]').evaluateAll((links) =>
    [...new Set(
      links
        .filter((link) => (link as HTMLElement).offsetParent !== null)
        .map((link) => (link as HTMLAnchorElement).getAttribute('href'))
        .filter((href): href is string => Boolean(href)),
    )],
  )
  expect(guideLinks.length, 'home should expose at least one featured guide').toBeGreaterThan(0)

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

test('anonymous navigation and merchant acquisition use traveller-first entry points', async ({ page }) => {
  const homeResponse = await page.goto('/en')
  expect(homeResponse?.status(), 'home should return HTTP 200').toBe(200)

  const header = page.getByRole('banner')
  await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/en/sign-in',
  )
  await expect(header.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
    'href',
    '/en/sign-up',
  )
  await expect(header.getByRole('link', { name: 'For Creators' })).toHaveAttribute(
    'href',
    '/en/for-creators',
  )
  await expect(header.getByRole('link', { name: 'For Merchants' })).toHaveAttribute(
    'href',
    '/en/for-merchants',
  )

  const landingResponse = await page.goto('/en/for-merchants')
  expect(landingResponse?.status(), 'merchant landing should return HTTP 200').toBe(200)

  const missionLinks = page.getByRole('link', { name: 'Post a mission' })
  expect(await missionLinks.count()).toBeGreaterThanOrEqual(3)
  for (const link of await missionLinks.all()) {
    await expect(link).toHaveAttribute('href', '/en/merchants/post')
  }

  await missionLinks.first().click()
  await page.waitForURL('**/en/merchants/apply')
})
