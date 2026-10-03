import { expect, type Page } from '@playwright/test'
export async function findAttributedExperience(page: Page, guideLinks: string[]): Promise<string> {
  for (const guideHref of guideLinks) {
    const response = await page.goto(guideHref)
    expect(response?.status(), `${guideHref} should return HTTP 200`).toBe(200)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('a[href^="/en/c/"]').first()).toBeVisible()
    const href = await page.locator('a[href^="/en/experiences/"][href*="src=guide"]')
      .evaluateAll(links => links.map(link => link.getAttribute('href')).find(Boolean) ?? null)
    if (href) return href
  }
  throw new Error('CONTENT_MISSING: no featured guide has an attributed experience link')
}
