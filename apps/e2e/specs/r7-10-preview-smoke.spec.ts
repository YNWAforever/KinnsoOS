import { expect, test } from '@playwright/test'
import { waitForRoute } from '../r7-10-accessibility'
import { R7_10_ROUTES } from '../r7-10-routes'

for (const route of R7_10_ROUTES) {
  test(`${route.id}: deployed preview resolves its declared route and landmark without mutation`, async ({ page }) => {
    const response = await waitForRoute(page, route)

    expect(response?.status(), `${route.id} must return HTTP 200`).toBe(200)
    await expect(page.locator('main:visible').first()).toBeVisible()
  })
}
