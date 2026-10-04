import { expect, test, type Page } from '@playwright/test'
import {
  INTERACTIVE_SELECTOR,
  hasMeaningfulFocusIndicator,
  isExcepted,
  waitForRoute,
  waitForVisualSettlement,
  type FocusStyleSnapshot,
} from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

/** Story 21: keyboard traversal beyond the header, which r7-10-accessibility.spec.ts covers. */

const BLURRED: FocusStyleSnapshot = {
  outlineStyle: 'none',
  outlineWidth: '0px',
  outlineColor: 'transparent',
  boxShadow: 'none',
}

async function activeFocusStyle(page: Page): Promise<FocusStyleSnapshot> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    const style = element ? getComputedStyle(element) : null
    return {
      outlineStyle: style?.outlineStyle ?? 'none',
      outlineWidth: style?.outlineWidth ?? '0px',
      outlineColor: style?.outlineColor ?? 'transparent',
      boxShadow: style?.boxShadow ?? 'none',
    }
  })
}

test.describe('R7.10 keyboard traversal', () => {
  for (const route of R7_10_ROUTES as readonly R710Route[]) {
    test(`${route.id}: the skip link is first and moves focus into main`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'skip-link'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)
      await page.keyboard.press('Tab')

      const href = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href'))
      expect(href, `${route.id}: the first Tab must land on the skip link`).toBe('#main-content')

      await page.keyboard.press('Enter')
      const focusedId = await page.evaluate(() => document.activeElement?.id)
      expect(focusedId, `${route.id}: activating the skip link must move focus into main`).toBe('main-content')
    })

    test(`${route.id}: every interactive element in main is reachable and shows focus`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'keyboard-reachable'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      // CSS applies a descendant combinator to only the FIRST clause of a selector list,
      // so `main ${INTERACTIVE_SELECTOR}` left seven of its eight clauses matching the
      // whole document — the header's locale <select> included. Scope each clause.
      const mainScoped = INTERACTIVE_SELECTOR.split(', ').map((clause) => `main ${clause}`).join(', ')

      await page.evaluate((selector) => {
        Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter((element) => element.getClientRects().length > 0)
          // A roving-tabindex composite (the WAI-ARIA Tabs widget in HowItWorks.tsx)
          // keeps its inactive members out of Tab order with tabindex="-1" on purpose;
          // they are reached with Arrow keys. `element.tabIndex` reflects the effective
          // value, so this drops exactly those without touching the shared selector,
          // which the structure spec still needs to see them for name checking.
          .filter((element) => element.tabIndex >= 0)
          // A native same-name radio group is ONE Tab stop: the checked member, or the
          // first when none is checked. Unchecked members still report tabIndex 0, so
          // excluding them here is the only way not to demand that the browser's own
          // grouping semantics be wrong.
          .filter((element, _index, all) => {
            const input = element as HTMLInputElement
            if (input.type !== 'radio' || !input.name) return true
            const group = all.filter((candidate) => {
              const other = candidate as HTMLInputElement
              return other.type === 'radio' && other.name === input.name
            })
            return (group.find((candidate) => (candidate as HTMLInputElement).checked) ?? group[0]) === element
          })
          .forEach((element, index) => element.setAttribute('data-r710-target', String(index)))
      }, mainScoped)

      const expected = await page.locator('[data-r710-target]').count()
      expect(expected, `${route.id} found no interactive elements in main`).toBeGreaterThan(0)

      // Cap the traversal so a genuine focus trap FAILS the test rather than hanging it.
      const maxTabs = expected + 10
      const reached = new Set<string>()
      const focusFailures: string[] = []

      // Enter `main` through the skip link rather than Tabbing in from the top. The
      // shared header is ~13 stops wide, which would consume the traversal budget
      // before the last elements of `main` were reached — the budget is meant to catch
      // a focus trap, not to be spent on chrome this test is not about.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')
      await expect(page.locator('#main-content')).toBeFocused()
      for (let index = 0; index < maxTabs && reached.size < expected; index += 1) {
        await page.keyboard.press('Tab')
        const marker = await page.evaluate(() => document.activeElement?.getAttribute('data-r710-target') ?? null)
        if (marker === null || reached.has(marker)) continue
        reached.add(marker)

        if (!isExcepted(route.id, 'focus-visible')) {
          const focused = await activeFocusStyle(page)
          if (!hasMeaningfulFocusIndicator(BLURRED, focused)) {
            focusFailures.push(`${marker}:${JSON.stringify(focused)}`)
          }
        }
      }

      expect(
        reached.size,
        `${route.id}: reached ${reached.size} of ${expected} interactive elements within ${maxTabs} tabs`,
      ).toBe(expected)
      expect(focusFailures, `${route.id}: elements focused with no visible indicator`).toEqual([])
    })

    test(`${route.id}: Tab traversal terminates rather than trapping`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'focus-trap'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      const total = await page.locator(INTERACTIVE_SELECTOR).count()
      const seen = new Set<string>()
      for (let index = 0; index < total + 10; index += 1) {
        await page.keyboard.press('Tab')
        seen.add(await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null
          if (!element) return 'none'
          return `${element.tagName.toLowerCase()}#${element.id}.${String(element.className || '').split(/\s+/)[0]}`
        }))
      }

      // A trap cycles a tiny set forever. Real traversal visits many distinct stops.
      expect(seen.size, `${route.id}: focus cycled through only ${seen.size} distinct elements`)
        .toBeGreaterThan(Math.min(3, total))
    })
  }
})
