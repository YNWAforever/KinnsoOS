import { expect, test, type Page } from '@playwright/test'
import {
  assertNoHorizontalOverflow,
  clippedElements,
  installLayoutShiftObserver,
  isExcepted,
  readCLS,
  tabTo,
  waitForRoute,
  waitForVisualSettlement,
  type ElementBox,
} from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

/**
 * Story 21: viewports and zoom.
 *
 * These MODEL zoom rather than drive it. Playwright cannot operate native browser
 * chrome zoom, so:
 *   - WCAG 1.4.4 Resize text -> root font-size scaled to 200% at 1280px wide
 *   - WCAG 1.4.10 Reflow     -> viewport narrowed to 320 CSS px
 * 320px is the standard's own definition of reflow, not an approximation of it. Do not
 * read these as proof that native browser zoom behaves identically.
 */
const WIDTHS = [380, 768, 1280, 1440] as const

for (const width of [1280, 2560]) {
  test(`navigation stays available by keyboard when desktop text is doubled at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await waitForRoute(page, R7_10_ROUTES[0])
    await waitForVisualSettlement(page)
    const desktopExplore = page.getByRole('banner').getByRole('link', { name: 'Explore', exact: true })
    await expect(desktopExplore).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const toggle = page.getByRole('banner').getByRole('button')
    await expect(toggle).toBeVisible()
    await expect(desktopExplore).toBeHidden()
    await tabTo(page, toggle)
    await page.keyboard.press('Enter')
    const menu = page.getByRole('dialog')
    await expect(menu).toBeVisible()
    for (const path of ['/explore', '/destinations', '/articles', '/agent', '/creators', '/merchants', '/for-creators', '/for-merchants', '/sign-in', '/sign-up']) {
      await expect(menu.locator(`a[href="/en${path}"]`)).toBeVisible()
    }
    await expect(menu.getByRole('combobox')).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(toggle).toBeFocused()
    // Switching back restores the original desktop row, without a client-side zoom detector.
    await page.addStyleTag({ content: 'html { font-size: 100% !important; }' })
    await expect(desktopExplore).toBeVisible()
    await expect(toggle).toBeHidden()
  })
}

test('Explore filters stay usable when enlarged text collapses the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await waitForRoute(page, R7_10_ROUTES[1])
  await waitForVisualSettlement(page)
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeHidden()
  expect(await page.locator('.k2-explore-guide-grid').evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const trigger = page.getByRole('button', { name: 'Filters', exact: true })
  await expect(trigger).toBeVisible()
  await trigger.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('radio', { name: 'Tokyo', exact: true }).check()
  await expect(page).toHaveURL(/destination=tokyo/)
  await sheet.getByRole('button', { name: /Show .* results/ }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: /Filters, 1 Active filters/ })).toBeFocused()
  await assertNoHorizontalOverflow(page)
})

async function measureTextBoxes(page: Page): Promise<{ total: number; visible: Array<ElementBox & { index: number }> }> {
  return page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(
      'main :is(p, h1, h2, h3, h4, li, dd, dt, button, a)',
    ))
    const visible = elements.flatMap((element, index) => {
      if (!element.getClientRects().length || !element.textContent?.trim()) return []
      const first = String(element.className || '').split(/\s+/)[0]
      return [{
        index,
        label: `${element.tagName.toLowerCase()}${first ? `.${first}` : ''}`,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }]
    })
    return { total: elements.length, visible }
  })
}

test.describe('R7.10 viewports and zoom', () => {
  for (const route of R7_10_ROUTES as readonly R710Route[]) {
    for (const width of WIDTHS) {
      test(`${route.id}: no overflow and stable layout at ${width}px`, async ({ page }) => {
        test.skip(isExcepted(route.id, 'viewport-overflow'), 'recorded in A11Y_EXCEPTIONS')
        await page.setViewportSize({ width, height: 900 })
        await installLayoutShiftObserver(page)
        await waitForRoute(page, route)
        await waitForVisualSettlement(page)

        await assertNoHorizontalOverflow(page)
        await expect(page.getByRole(route.ready.role, { level: route.ready.level }).first()).toBeVisible()

        if (!isExcepted(route.id, 'viewport-cls')) {
          expect(await readCLS(page), `${route.id} at ${width}px must keep unexpected CLS at or below 0.1`)
            .toBeLessThanOrEqual(0.1)
        }
      })
    }

    test(`${route.id}: text stays unclipped at 200% (WCAG 1.4.4)`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      // Baseline first. Some elements are deliberately truncated at EVERY size --
      // `line-clamp` on card summaries, for instance -- and reporting those would bury
      // the real signal under intentional design. WCAG 1.4.4 concerns content lost BY
      // resizing, so only an element that becomes clipped when the text scales counts.
      const before = await measureTextBoxes(page)

      // Models browser text zoom. Applied after load so it cannot affect hydration.
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await waitForVisualSettlement(page)
      const after = await measureTextBoxes(page)

      expect(before.visible.length, `${route.id} measured no text — selector or route is wrong`).toBeGreaterThan(0)
      // Compare stable DOM indexes, including hidden nodes. Responsive trays can
      // reveal a button under zoom; that newly visible text must also fit. Repeated
      // labels cannot hide another element's clipping; DOM-size changes fail.
      expect(after.total, `${route.id} DOM element set changed under zoom; indexes cannot be compared`)
        .toBe(before.total)
      const baseline = new Map(before.visible.map((box) => [box.index, box]))

      const clipped = (box: ElementBox) => clippedElements([box]).length > 0
      const newlyClipped = after.visible
        .filter((box) => clipped(box) && (!baseline.has(box.index) || !clipped(baseline.get(box.index)!)))
        .map((box) => box.label)

      expect(newlyClipped, `${route.id} clips text at 200% that was intact at 100%`).toEqual([])
      await assertNoHorizontalOverflow(page)
    })

    test(`${route.id}: reflows at 320px without horizontal scrolling (WCAG 1.4.10)`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'reflow-320'), 'recorded in A11Y_EXCEPTIONS')
      await page.setViewportSize({ width: 320, height: 900 })
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      await assertNoHorizontalOverflow(page)
      // "No content loss" is not decidable from outside, so assert the specific things
      // a reflowed page must retain rather than pretending to prove the general claim.
      await expect(page.getByRole(route.ready.role, { level: route.ready.level }).first()).toBeVisible()
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('banner')).toHaveCount(1)
    })
  }
})
