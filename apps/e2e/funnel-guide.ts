import { expect, type Page } from '@playwright/test'

export async function findPublishedGuideLinks(page: Page): Promise<string[]> {
  // KinnsoOS loads the catalog after hydration. Do not mistake loading or a
  // catalog error for an empty pilot, or skip a funnel whose guides arrive later.
  await expect(page.getByText('Loading published guides…', { exact: true })).toBeHidden()
  const guideLinks = await page.locator('a[href^="/en/g/"]').evaluateAll((links) =>
    [...new Set(
      links
        .filter((link) => (link as HTMLElement).offsetParent !== null)
        .map((link) => (link as HTMLAnchorElement).getAttribute('href'))
        .filter((href): href is string => Boolean(href)),
    )],
  )
  if (guideLinks.length === 0) {
    await expect(page.locator('body')).toContainText(
      /No published guides yet\.|Published content is not connected yet\./,
    )
  }
  return guideLinks
}

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
