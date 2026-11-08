import { test, expect } from '@playwright/test'
import { findAttributedExperience, findPublishedGuideLinks } from '../funnel-guide'

test.beforeEach(async ({ page }) => {
  await page.route('**/en/c/synthetic', route => route.fulfill({ contentType: 'text/html',
    body: '<h1>Synthetic creator</h1>' }))
})

for (const message of ['No published guides yet.', 'Published content is not connected yet.']) {
  test(`synthetic pilot catalog: ${message}`, async ({ page }) => {
    await page.setContent(`<h1>Synthetic pilot fixture</h1><p>${message}</p>`)
    expect(await findPublishedGuideLinks(page)).toEqual([])
  })
}

test('synthetic catalog waits for published guides instead of skipping during loading', async ({ page }) => {
  await page.setContent(`<h1>Synthetic pilot fixture</h1><p id="catalog">Loading published guides…</p>
    <script>setTimeout(() => {
      document.querySelector('#catalog').outerHTML = '<a href="/en/g/second">Published guide</a>'
    }, 100)</script>`)
  const guides = await findPublishedGuideLinks(page)
  expect(guides).toEqual(['/en/g/second'])
  await page.route('**/en/g/**', route => route.fulfill({ contentType: 'text/html', body:
    '<h1>Synthetic published guide</h1><a href="/en/c/synthetic">Creator</a>' +
    '<a href="/en/experiences/synthetic?src=guide">Experience</a>' }))
  expect(await findAttributedExperience(page, guides)).toBe('/en/experiences/synthetic?src=guide')
})

test('a summary-only first guide does not stop the attributed-link search', async ({ page }) => {
  await page.route('**/en/g/**', route => route.fulfill({ contentType: 'text/html', body:
    `<h1>Synthetic guide fixture</h1><a href="/en/c/synthetic">Creator</a>` +
    (route.request().url().endsWith('/second') ? '<a href="/en/experiences/synthetic?src=guide">Experience</a>' : '') }))
  expect(await findAttributedExperience(page, ['/en/g/first', '/en/g/second']))
    .toBe('/en/experiences/synthetic?src=guide')
})
test('no attributed link is an immediate content failure, not a locator timeout', async ({ page }) => {
  await page.route('**/en/g/**', route => route.fulfill({ contentType: 'text/html',
    body: '<h1>Synthetic summary</h1><a href="/en/c/synthetic">Creator</a>' }))
  await expect(findAttributedExperience(page, ['/en/g/first', '/en/g/second']))
    .rejects.toThrow('CONTENT_MISSING')
})

test('a loading guide is not prematurely labelled as missing its creator link', async ({ page }, testInfo) => {
  await page.route('**/en/g/loading', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
    `<h1>Synthetic loading guide</h1><p id="loading">Loading…</p><script>setTimeout(() => {
      document.querySelector('#loading').outerHTML = '<a href="/en/c/synthetic">Creator</a>' +
        '<a href="/en/experiences/synthetic?src=guide">Experience</a>'
    }, 100)</script>` }))
  expect(await findAttributedExperience(page, ['/en/g/loading'])).toBe('/en/experiences/synthetic?src=guide')
  expect(testInfo.annotations).toEqual([])
})
