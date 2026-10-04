import { expect, test } from '@playwright/test'

test('Explore state is URL-stable, reloadable, paginated, and resettable', async ({ page }) => {
  const response = await page.goto('/en/explore')
  expect(response?.status()).toBe(200)

  const historyLength = await page.evaluate(() => window.history.length)
  await expect(page.getByRole('searchbox', { name: 'Search guides' })).toBeVisible()
  await page.getByRole('radio', { name: 'Tokyo' }).check()
  await expect(page).toHaveURL(/destination=tokyo/)
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)

  await page.getByRole('searchbox', { name: 'Search guides' }).fill('R7')
  await expect(page).toHaveURL(/q=R7/)
  await page.getByLabel('Sort by').selectOption('most-saved')
  await expect(page).toHaveURL(/sort=most-saved/)
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)

  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(12)
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(13)

  await page.reload()
  await expect(page.getByRole('radio', { name: 'Tokyo' })).toBeChecked()
  await expect(page.getByRole('searchbox', { name: 'Search guides' })).toHaveValue('R7')
  await expect(page.getByLabel('Sort by')).toHaveValue('most-saved')
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(13)

  await page.getByRole('searchbox', { name: 'Search guides' }).fill('definitely-no-match')
  await expect(page.getByText('No guides match these filters')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search guides' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(page).toHaveURL('/en/explore')
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(12)
})

test('Explore guide cards retain their established public URLs', async ({ page }) => {
  const response = await page.goto('/en/explore')
  expect(response?.status()).toBe(200)

  const guideLink = page.locator('a[href="/en/g/r7-smoke-tokyo-guide"]')
  await expect(guideLink).toBeVisible()
  await guideLink.click()
  await expect(page).toHaveURL('/en/g/r7-smoke-tokyo-guide')
  await expect(page.getByRole('heading', { level: 1, name: 'R7 Smoke Tokyo Guide' })).toBeVisible()
})
test('mobile filters use an accessible bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en/explore')
  const trigger = page.getByRole('button', { name: /^Filters/ })
  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('radio', { name: 'Tokyo' }).check()
  await expect(page.locator('button[aria-label^="Filters"]')).toContainText('(1)')
  await sheet.getByRole('button', { name: /Show 13 results/ }).click()
  await expect(sheet).toBeHidden()
  await expect(trigger).toBeFocused()
})