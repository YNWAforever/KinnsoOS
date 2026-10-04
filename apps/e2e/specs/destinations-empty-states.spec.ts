import { expect, test } from '@playwright/test'

function parseJsonLd(blocks: string[]): Array<Record<string, unknown>> {
  return blocks.flatMap((block) => {
    const parsed = JSON.parse(block) as Record<string, unknown> | Array<Record<string, unknown>>
    return Array.isArray(parsed) ? parsed : [parsed]
  })
}

test('seeded Tokyo inventory renders an index card and canonical discovery detail', async ({ page }) => {
  const indexResponse = await page.goto('/en/destinations')
  expect(indexResponse?.status(), 'destinations index should return HTTP 200').toBe(200)

  const tokyoCard = page.locator('a[href="/en/destinations/tokyo"]')
  await expect(tokyoCard).toHaveCount(1)
  await expect(tokyoCard).toContainText('Tokyo')
  await expect(tokyoCard.getByText(/[1-9]\d* guides?/)).toBeVisible()
  await expect(tokyoCard.getByText(/[1-9]\d* experiences?/)).toBeVisible()

  await expect(tokyoCard.locator('[data-media-placeholder="true"]')).toBeVisible()
  await expect(tokyoCard.locator('img')).toHaveCount(0)

  await Promise.all([
    page.waitForURL(/\/en\/destinations\/tokyo$/),
    tokyoCard.click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: 'Tokyo' })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://www.kinnso.ai/en/destinations/tokyo',
  )

  await expect(
    page.getByRole('heading', { level: 2, name: /^(Guides|Experiences|Articles|Upcoming sessions)$/ }).first(),
  ).toBeVisible()
  await expect(page.locator('a[href="/en/g/r7-smoke-tokyo-guide"]')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'R7 Smoke Tokyo Guide' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'R7 Smoke Tokyo Experience' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Articles' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Best Ramen in Tokyo' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Upcoming sessions' })).toHaveCount(0)
  await expect(page.getByText('No guides for this destination yet.')).toHaveCount(0)
  await expect(page.getByText('No bookable experiences here yet.')).toHaveCount(0)
  await expect(page.getByText('No sessions scheduled for this destination right now.')).toHaveCount(0)

  const jsonLd = parseJsonLd(await page.locator('script[type="application/ld+json"]').allTextContents())
  const itemList = jsonLd.find((block) => block['@type'] === 'ItemList') as
    | { itemListElement?: Array<{ position?: number; url?: string }> }
    | undefined
  expect(itemList?.itemListElement, 'rendered discovery resources should emit an ItemList').toBeTruthy()
  const items = itemList!.itemListElement!
  expect(items.length).toBeGreaterThan(0)
  expect(items.map((item) => item.position)).toEqual(items.map((_, index) => index + 1))
  expect(items.every((item) => item.url?.startsWith('https://www.kinnso.ai/en/'))).toBe(true)
})

test('sessions uses the visible listing when present or captures a waitlist signup when empty', async ({ page }) => {
  const response = await page.goto('/en/sessions')
  expect(response?.status(), 'sessions should return HTTP 200').toBe(200)

  const sessionCards = page.locator('a[href^="/en/sessions/"]')
  if (await sessionCards.count()) {
    await expect(sessionCards.first()).toBeVisible()
    await expect(page.getByRole('form', { name: 'Session updates' })).toHaveCount(0)
    return
  }

  const waitlist = page.getByRole('form', { name: 'Session updates' })
  await expect(waitlist).toBeVisible()
  await expect(page.getByText(/Live sessions turn practical travel questions/i)).toBeVisible()
  await waitlist.getByLabel('Email address').fill(`e2e+sessions-${Date.now()}@kinnso.test`)
  await waitlist.getByRole('button', { name: 'Join the waitlist' }).click()
  await expect(waitlist.getByRole('status')).toHaveText("You're on the waitlist.")
})

test('article hub omits the known-empty destinations category', async ({ page }) => {
  const response = await page.goto('/en/articles')
  expect(response?.status(), 'articles hub should return HTTP 200').toBe(200)

  // The local seed visibly resolves Dining, while its destination record is
  // expired and its shopping-only coupon is excluded from public results.
  // This confirms the precondition before asserting empty sections are absent.
  await expect(page.getByRole('heading', { level: 2, name: 'Dining' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Shopping' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 2, name: 'Destinations' })).toHaveCount(0)
  await expect(page.locator('a[href="/en/articles/shopping"], a[href="/en/articles/destinations"]')).toHaveCount(0)
  await expect(
    page.locator('main section:has(a[href="/en/articles/shopping"]), main section:has(a[href="/en/articles/destinations"])'),
  ).toHaveCount(0)
})
