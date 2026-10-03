import { readFile } from 'node:fs/promises'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  assertNoHorizontalOverflow,
  calculateCLS,
  formatAxeViolations,
  hasMeaningfulFocusIndicator,
  installLayoutShiftObserver,
  readCLS,
  tabTo,
  unapprovedViolations,
  waitForRoute,
  waitForVisualSettlement,
  type FocusStyleSnapshot,
} from '../r7-10-accessibility'
import { AXE_EXCEPTIONS } from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

async function readFocusStyle(locator: Parameters<typeof tabTo>[1]): Promise<FocusStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    }
  })
}

async function captureUnfocusedFocusStyle(locator: Parameters<typeof tabTo>[1]): Promise<FocusStyleSnapshot> {
  await expect(locator).not.toBeFocused()
  return readFocusStyle(locator)
}

async function expectVisibleFocus(locator: Parameters<typeof tabTo>[1], baseline: FocusStyleSnapshot) {
  await expect(locator).toBeFocused()
  await expect.poll(async () => {
    const focused = await readFocusStyle(locator)
    return hasMeaningfulFocusIndicator(baseline, focused)
      ? 'focus-indicator-visible'
      : JSON.stringify(focused)
  }, {
    message: `expected a focus-induced visible outline or ring; baseline=${JSON.stringify(baseline)}`,
  }).toBe('focus-indicator-visible')
}

test('desktop assertControl structurally requires a visible-focus assertion', async () => {
  const source = await readFile(new URL(import.meta.url), 'utf8')
  expect(source).toMatch(/const assertControl[\s\S]*?await expectVisibleFocus\(control, baseline\)/)
})

test('desktop visible focus structurally polls without fixed sleeps', async () => {
  const source = await readFile(new URL(import.meta.url), 'utf8')
  expect(source).toMatch(/await expect\.poll\([\s\S]*?hasMeaningfulFocusIndicator\(baseline, focused\)/)
  expect(source).not.toMatch(/\b(?:waitForTimeout|setTimeout|sleep)\s*\(/)
})

test('CLS uses the largest input-free session window instead of a page-lifetime sum', () => {
  expect(calculateCLS([
    { value: 0.04, startTime: 0, hadRecentInput: false },
    { value: 0.04, startTime: 900, hadRecentInput: false },
    { value: 0.04, startTime: 1800, hadRecentInput: false },
    { value: 0.04, startTime: 2700, hadRecentInput: false },
    { value: 0.04, startTime: 3600, hadRecentInput: false },
    { value: 0.04, startTime: 4500, hadRecentInput: false },
    { value: 0.04, startTime: 5400, hadRecentInput: false },
    { value: 1, startTime: 5500, hadRecentInput: true },
  ])).toBeCloseTo(0.24)
})

test.describe('R7.10 rendered accessibility contracts', () => {
  for (const route of R7_10_ROUTES) {
    test(`${route.id}: zero critical or serious axe findings`, async ({ page }) => {
      await waitForRoute(page, route)
      const results = await new AxeBuilder({ page }).analyze()
      const relevant = results.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      )
      const unapproved = unapprovedViolations(route.id, relevant, AXE_EXCEPTIONS)

      expect(unapproved, formatAxeViolations(route.id, unapproved)).toEqual([])
    })

    test(`${route.id}: remains usable without overflow or unexpected CLS at 380px`, async ({ page }) => {
      await page.setViewportSize({ width: 380, height: 844 })
      await installLayoutShiftObserver(page)
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      await assertNoHorizontalOverflow(page)
      expect(await readCLS(page), `${route.id} must keep unexpected CLS at or below 0.1`).toBeLessThanOrEqual(0.1)
    })
  }
})

const DESKTOP_PRIMARY_HREFS = [
  '/en/explore', '/en/destinations', '/en/articles', '/en/agent', '/en/creators',
  '/en/merchants', '/en/for-creators', '/en/for-merchants', '/en/sign-in', '/en/sign-up',
] as const
const MOBILE_PRIMARY_HREFS = [
  '/en/explore', '/en/destinations', '/en/articles', '/en/agent', '/en/creators',
  '/en/merchants', '/en/for-creators', '/en/for-merchants', '/en/sign-in', '/en/sign-up',
] as const
const LOCALE_SWITCHER = { role: 'combobox' as const, name: 'Language' }

test('desktop header advances one Tab through explicit links and LocaleSwitcher', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await waitForRoute(page, R7_10_ROUTES[0] as R710Route)
  const header = page.getByRole('banner')
  const assertControl = async (control: ReturnType<typeof header.locator>, baseline: FocusStyleSnapshot) => {
    await expectVisibleFocus(control, baseline)
    await expect(control).toBeVisible()
  }

  const logo = header.getByRole('link', { name: 'KINNSO', exact: true })
  const logoBaseline = await captureUnfocusedFocusStyle(logo)
  await tabTo(page, logo)
  await assertControl(logo, logoBaseline)
  for (const href of DESKTOP_PRIMARY_HREFS.slice(0, 8)) {
    const control = header.locator(`a[href="${href}"]`)
    const baseline = await captureUnfocusedFocusStyle(control)
    await page.keyboard.press('Tab')
    await assertControl(control, baseline)
  }
  const localeSwitcher = header.getByRole(LOCALE_SWITCHER.role, { name: LOCALE_SWITCHER.name })
  const localeSwitcherBaseline = await captureUnfocusedFocusStyle(localeSwitcher)
  await page.keyboard.press('Tab')
  await assertControl(localeSwitcher, localeSwitcherBaseline)
  for (const href of DESKTOP_PRIMARY_HREFS.slice(8)) {
    const control = header.locator(`a[href="${href}"]`)
    const baseline = await captureUnfocusedFocusStyle(control)
    await page.keyboard.press('Tab')
    await assertControl(control, baseline)
  }

  await page.goto('/en')
  const explore = header.locator('a[href="/en/explore"]')
  const exploreBaseline = await captureUnfocusedFocusStyle(explore)
  await tabTo(page, explore)
  await expectVisibleFocus(explore, exploreBaseline)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/en\/explore$/)
})

for (const route of R7_10_ROUTES.filter((entry) => 'mobileHeaderJourney' in entry && entry.mobileHeaderJourney)) {
  test(`${route.id}: mobile header keeps primary destinations inside its named dialog`, async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 844 })
    await waitForRoute(page, route)

    const trigger = page.getByRole('button', { name: /menu/i })
    const triggerControl = page.locator('[data-slot="dialog-trigger"]')
    const triggerBaseline = await captureUnfocusedFocusStyle(trigger)
    await tabTo(page, trigger)
    await expectVisibleFocus(trigger, triggerBaseline)
    await page.keyboard.press('Enter')
    await expect(triggerControl).toHaveAttribute('aria-expanded', 'true')

    const dialog = page.getByRole('dialog', { name: /menu/i })
    await expect(dialog).toBeVisible()
    const primaryHrefs = MOBILE_PRIMARY_HREFS
    for (const href of primaryHrefs) await expect(dialog.locator(`a[href="${href}"]`)).toBeVisible()

    const assertFocusedDialogControl = async (control: ReturnType<typeof dialog.locator>) => {
      await expect(control).toBeFocused()
      await expect(control).toBeVisible()
      expect(await control.evaluate((element) => element.closest('[role="dialog"]') !== null)).toBe(true)
    }
    const assertFocusIsInDialog = async (href: string) => {
      await assertFocusedDialogControl(dialog.locator(`a[href="${href}"]`))
    }

    await tabTo(page, dialog.locator(`a[href="${primaryHrefs[0]}"]`))
    await assertFocusIsInDialog(primaryHrefs[0])
    for (const href of primaryHrefs.slice(1, 8)) {
      await page.keyboard.press('Tab')
      await assertFocusIsInDialog(href)
    }
    await page.keyboard.press('Tab')
    await assertFocusedDialogControl(dialog.getByRole(LOCALE_SWITCHER.role, { name: LOCALE_SWITCHER.name }))
    for (const href of primaryHrefs.slice(8)) {
      await page.keyboard.press('Tab')
      await assertFocusIsInDialog(href)
    }
    await page.keyboard.press('Shift+Tab')
    await assertFocusIsInDialog(primaryHrefs[8])
    await page.keyboard.press('Shift+Tab')
    await assertFocusedDialogControl(dialog.getByRole(LOCALE_SWITCHER.role, { name: LOCALE_SWITCHER.name }))
    for (const href of primaryHrefs.slice(0, 8).reverse()) {
      await page.keyboard.press('Shift+Tab')
      await assertFocusIsInDialog(href)
    }

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(triggerControl).toBeFocused()
  })
}
