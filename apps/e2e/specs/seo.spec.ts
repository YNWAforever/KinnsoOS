import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

const jsonLd = async (page: import('@playwright/test').Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents())
    .flatMap((text) => {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : [parsed]
    })

test('flagship SEO head (en): canonical, og:type, hreflang, JSON-LD dateModified', async ({ page }) => {
  await page.goto(FIXTURES.flagship.path)

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(canonical).toContain('/en/articles/dining/ramen-guide')

  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')

  for (const hl of FIXTURES.presentLocales) {
    expect(await page.locator(`link[rel="alternate"][hreflang="${hl}"]`).count()).toBe(1)
  }
  expect(await page.locator('link[rel="alternate"][hreflang="x-default"]').count()).toBe(1)

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const ld = blocks.flatMap((t) => {
    const parsed = JSON.parse(t)
    return Array.isArray(parsed) ? parsed : [parsed]
  })
  const article = ld.find((o: { '@type'?: string }) => o['@type'] === 'Article') as
    | { dateModified?: string }
    | undefined
  expect(article?.dateModified).toBeTruthy()
  expect(ld.some((o: { '@type'?: string }) => o['@type'] === 'FAQPage')).toBe(true)
})

test('reciprocal hreflang on zh-hk flagship', async ({ page }) => {
  await page.goto(FIXTURES.flagshipHk.path)
  expect(await page.locator('link[rel="alternate"][hreflang="en"]').count()).toBe(1)
  expect(await page.locator('link[rel="alternate"][hreflang="zh-hk"]').count()).toBe(1)
})

test('public guide has seven-locale parity and a rendered OG image', async ({ page, request }) => {
  await page.goto(FIXTURES.seoEntities.guidePath)
  const expectedHreflangs = [
    'en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn', 'x-default',
  ].sort()
  const alternates = await page
    .locator('link[rel="alternate"][hreflang]')
    .evaluateAll((links) => links.map((link) => ({
      hreflang: link.getAttribute('hreflang'),
      href: link.getAttribute('href'),
    })))
  expect(alternates.map(({ hreflang }) => hreflang).sort()).toEqual(
    expectedHreflangs,
  )
  const xDefault = alternates.find(
    ({ hreflang }) => hreflang === 'x-default',
  )?.href
  expect(new URL(xDefault!).pathname).toBe(FIXTURES.seoEntities.guidePath)
  expect((await jsonLd(page)).some((item) => item['@type'] === 'Article')).toBe(
    true,
  )
  const og = await request.get(
    `${FIXTURES.seoEntities.guidePath}/opengraph-image`,
  )
  expect(og.ok()).toBe(true)
  expect(og.headers()['content-type']).toContain('image/')
})

test('public experience emits Product/Offer and a rendered OG image', async ({ page, request }) => {
  await page.goto(FIXTURES.seoEntities.experiencePath)
  const product = (await jsonLd(page)).find(
    (item) => item['@type'] === 'Product',
  )
  expect(product?.offers?.price).toBe(12000)
  expect(product?.offers?.priceCurrency).toBe('JPY')
  expect([
    'https://schema.org/InStock',
    'https://schema.org/OutOfStock',
  ]).toContain(product?.offers?.availability)
  const og = await request.get(
    `${FIXTURES.seoEntities.experiencePath}/opengraph-image`,
  )
  expect(og.ok()).toBe(true)
  expect(og.headers()['content-type']).toContain('image/')
})

test('a public session emits Event when a session fixture is available', async ({ page }) => {
  const response = await page.goto('/en/sessions')
  expect(response?.ok()).toBe(true)
  const firstSession = page.locator('a[href^="/en/sessions/"]').first()
  const hasPublicSession = await firstSession.count() > 0
  if (!hasPublicSession) {
    await expect(page.getByRole('form', { name: 'Session updates' })).toBeVisible()
  }
  test.skip(
    !hasPublicSession,
    'No public session exists in this environment',
  )
  await firstSession.click()
  expect((await jsonLd(page)).some((item) => item['@type'] === 'Event')).toBe(
    true,
  )
})
