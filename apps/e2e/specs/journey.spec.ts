import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

test.describe('article journey', () => {
  test('hub → listing → detail (en)', async ({ page }) => {
    await page.goto(FIXTURES.hub.path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.goto(FIXTURES.listing.path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const cards = page.locator('a[href*="/en/articles/dining/"]')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(12) // 12-per-page contract
    await expect(page.locator('a[href$="/en/articles/dining/ramen-guide"]').first()).toBeVisible()
    await expect(page.locator('a[href$="/en/articles/dining/cafe-guide"]')).toHaveCount(0)

    await page.goto(FIXTURES.flagship.path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FIXTURES.flagship.h1)
    await expect(page.getByText(FIXTURES.flagship.bodyText, { exact: false })).toBeVisible()
    await expect(page.getByText(FIXTURES.flagship.faqQuestion)).toBeVisible()
    await expect(page.locator('a[href$="/en/articles/dining/sushi-guide"]')).toHaveCount(0)
  })

  test('detail renders CJK on zh-hk', async ({ page }) => {
    await page.goto(FIXTURES.flagshipHk.path)
    await expect(page.getByText(FIXTURES.flagshipHk.bodyText)).toBeVisible()
  })

  test('listing filters narrow the result set', async ({ page }) => {
    await page.goto(`${FIXTURES.listing.path}?tag=noodles`)
    await expect(page.locator('a[href$="/en/articles/dining/ramen-guide"]').first()).toBeVisible()
    await expect(page.locator('a[href$="/en/articles/dining/cafe-guide"]')).toHaveCount(0)

    await page.goto(`${FIXTURES.listing.path}?region=tokyo`)
    await expect(page.locator('a[href$="/en/articles/dining/ramen-guide"]').first()).toBeVisible()
    await expect(page.locator('a[href$="/en/articles/dining/sushi-guide"]')).toHaveCount(0)
    await expect(page.locator('a[href$="/en/articles/dining/cafe-guide"]')).toHaveCount(0) // cafe is osaka
  })
})
