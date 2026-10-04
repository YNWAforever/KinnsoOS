import { expect, test } from '@playwright/test'
import { findForbiddenPlaceholderTokens } from '@kinnso/honesty'

const routes = [
  '/en',
  '/en/explore',
  '/en/articles',
  '/en/c/r7-smoke-creator',
  '/en/m/r7-smoke-tokyo-host',
] as const

const smokeGuide = {
  href: '/en/g/r7-smoke-tokyo-guide',
} as const

for (const route of routes) {
  test(`honest rendered HTML: ${route}`, async ({ page }) => {
    const response = await page.goto(route)
    expect(response?.status(), `${route} should return HTTP 200`).toBe(200)

    const html = await page.content()
    expect(findForbiddenPlaceholderTokens(html), `${route} must not render placeholder content`).toEqual([])

    if (route === '/en') {
      const guide = page.locator(`a[href="${smokeGuide.href}"]`).first()
      await expect(guide.locator('[data-media-placeholder="true"]')).toBeVisible()
      await expect(guide.locator('img')).toHaveCount(0)
    }

    if (route === '/en/c/r7-smoke-creator') {
      await expect(page.locator('[data-media-placeholder="true"]').first()).toBeVisible()
    }
  })
}
