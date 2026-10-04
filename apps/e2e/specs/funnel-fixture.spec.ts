import { test, expect } from '@playwright/test'
import { findAttributedExperience } from '../funnel-guide'
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
