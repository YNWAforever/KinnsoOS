import { expect, test } from '@playwright/test'
import {
  INTERACTIVE_SELECTOR,
  firstHeadingOrderViolation,
  isExcepted,
  waitForRoute,
} from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

/**
 * Story 21, the machine-checkable half of "screen reader": structural facts an
 * accessibility tree can prove. Whether announcements SOUND correct needs a human ear
 * and lives in docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md, not here.
 */
test.describe('R7.10 accessibility tree structure', () => {
  for (const route of R7_10_ROUTES as readonly R710Route[]) {
    test(`${route.id}: exactly one main, banner and contentinfo landmark`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'landmarks'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('banner')).toHaveCount(1)
      await expect(page.getByRole('contentinfo')).toHaveCount(1)
    })

    test(`${route.id}: heading levels never skip`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'heading-order'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      const headings = await page.evaluate(() => Array.from(
        document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
      )
        .filter((heading) => heading.getClientRects().length > 0)
        .map((heading) => ({
          level: Number(heading.tagName[1]),
          text: (heading.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        })))

      const levels = headings.map((heading) => heading.level)
      const outline = headings.map((heading, index) => `  ${index + 1}. h${heading.level} ${heading.text}`).join('\n')

      expect(levels.length, `${route.id} rendered no headings — selector or route is wrong`).toBeGreaterThan(0)
      expect(
        firstHeadingOrderViolation(levels),
        `${route.id} heading order. Outline was:\n${outline}`,
      ).toBeUndefined()
    })

    test(`${route.id}: every interactive element has an accessible name`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'accessible-name'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      const unnamed = await page.evaluate((selector) => Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      )
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => {
          if (element.getAttribute('aria-label')?.trim()) return false
          const labelledBy = element.getAttribute('aria-labelledby')
          if (labelledBy?.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())) return false
          if (element.textContent?.trim()) return false
          if (element.getAttribute('title')?.trim()) return false

          // HTMLInputElement.labels resolves BOTH implicit (<label>wraps</label>) and
          // explicit (label[for] + id) association — the same rule the browser and AT
          // use. Without this, every correctly-labelled input is a false positive,
          // because <input> is a void element whose textContent is always empty.
          const labels = (element as HTMLInputElement).labels
          if (labels && Array.from(labels).some((label) => label.textContent?.trim())) return false

          // A submit/button input takes its accessible name from `value`.
          const input = element as HTMLInputElement
          if ((input.type === 'submit' || input.type === 'button') && input.value?.trim()) return false

          return !element.querySelector('img[alt]')?.getAttribute('alt')?.trim()
        })
        .map((element) => {
          const first = String(element.className || '').split(/\s+/)[0]
          return `${element.tagName.toLowerCase()}${first ? `.${first}` : ''}`
        }), INTERACTIVE_SELECTOR)

      expect(unnamed, `${route.id} has interactive elements with no accessible name`).toEqual([])
    })

    test(`${route.id}: html lang matches the route locale`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'html-lang'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      // Every manifest route is under /en, so the document must declare English.
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })
  }
})
