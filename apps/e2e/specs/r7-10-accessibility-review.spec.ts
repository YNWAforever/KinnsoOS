import { expect, test } from '@playwright/test'
import {
  A11Y_EXCEPTIONS,
  calculateCLS,
  clippedElements,
  firstHeadingOrderViolation,
  formatAxeViolations,
  hasMeaningfulFocusIndicator,
  installLayoutShiftObserver,
  isExcepted,
  readCLS,
  type ElementBox,
  type FocusStyleSnapshot,
} from '../r7-10-accessibility'

test('axe diagnostics include rule, impact, target, and help URL', () => {
  expect(formatAxeViolations('home', [{
    id: 'color-contrast', impact: 'serious', help: 'Contrast help',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.12/color-contrast',
    nodes: [{ target: ['main', '.card'] }],
  }])).toContain('https://dequeuniversity.com/rules/axe/4.12/color-contrast')
})

test('CLS includes a shift exactly five seconds after its session begins', () => {
  expect(calculateCLS([
    { value: 0.01, startTime: 0, hadRecentInput: false },
    { value: 0.01, startTime: 900, hadRecentInput: false },
    { value: 0.01, startTime: 1_800, hadRecentInput: false },
    { value: 0.01, startTime: 2_700, hadRecentInput: false },
    { value: 0.01, startTime: 3_600, hadRecentInput: false },
    { value: 0.01, startTime: 4_500, hadRecentInput: false },
    { value: 0.04, startTime: 5_000, hadRecentInput: false },
  ])).toBeCloseTo(0.1)
})

test('CLS refuses to report a zero score when layout-shift observation setup fails', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'PerformanceObserver', { configurable: true, value: undefined }))
  await installLayoutShiftObserver(page)
  await page.goto('about:blank')
  await expect(readCLS(page)).rejects.toThrow(/layout.shift.*(unsupported|failed)|(unsupported|failed).*layout.shift/i)
})

test('focus indicator requires a focus-induced visible outline or ring', async () => {
  const base: FocusStyleSnapshot = {
    outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgba(0, 0, 0, 0)', boxShadow: 'none',
  }
  const cases: Array<{ name: string; baseline: FocusStyleSnapshot; focused: FocusStyleSnapshot; expected: boolean }> = [
    {
      name: 'accepts a changed opaque outline with width', baseline: base,
      focused: { ...base, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgb(194, 65, 12)' }, expected: true,
    },
    {
      name: 'accepts a changed opaque focus ring with spread', baseline: base,
      focused: { ...base, boxShadow: 'rgb(194, 65, 12) 0px 0px 0px 2px' }, expected: true,
    },
    {
      name: 'rejects unchanged permanent decorative shadow',
      baseline: { ...base, boxShadow: 'rgb(0, 0, 0) 0px 2px 8px 0px' },
      focused: { ...base, boxShadow: 'rgb(0, 0, 0) 0px 2px 8px 0px' }, expected: false,
    },
    {
      name: 'rejects a zero-width outline', baseline: base,
      focused: { ...base, outlineStyle: 'solid', outlineWidth: '0px', outlineColor: 'rgb(194, 65, 12)' }, expected: false,
    },
    {
      name: 'rejects a transparent outline', baseline: base,
      focused: { ...base, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgba(194, 65, 12, 0)' }, expected: false,
    },
    {
      name: 'rejects a zero-extent ring', baseline: base,
      focused: { ...base, boxShadow: 'rgb(194, 65, 12) 0px 0px 0px 0px' }, expected: false,
    },
    {
      name: 'rejects a transparent ring', baseline: base,
      focused: { ...base, boxShadow: 'rgba(194, 65, 12, 0) 0px 0px 0px 2px' }, expected: false,
    },
  ]

  for (const { name, baseline, focused, expected } of cases) {
    expect(hasMeaningfulFocusIndicator(baseline, focused), name).toBe(expected)
  }
})

test('a11y exceptions match on both route and check, never one alone', () => {
  const exceptions = [{
    routeId: 'guide' as const,
    check: 'reflow-320' as const,
    reason: 'Itinerary table needs a real responsive rewrite',
    owner: 'Design',
    reviewWhen: 'Before public launch',
  }]

  expect(isExcepted('guide', 'reflow-320', exceptions)).toBe(true)
  expect(isExcepted('guide', 'text-200', exceptions)).toBe(false)
  expect(isExcepted('home', 'reflow-320', exceptions)).toBe(false)
  expect(isExcepted('home', 'text-200', exceptions)).toBe(false)
})

test('a11y ledger defaults to the real list when none is passed', () => {
  expect(isExcepted('home', 'reflow-320')).toBe(A11Y_EXCEPTIONS.some(
    (entry) => entry.routeId === 'home' && entry.check === 'reflow-320',
  ))
})

test('heading order rejects a skipped level and accepts a legal descent', () => {
  expect(firstHeadingOrderViolation([1, 2, 3, 2, 3])).toBeUndefined()
  expect(firstHeadingOrderViolation([1, 2, 4])).toBe('h2 is followed by h4 at position 3; levels must not skip')
  expect(firstHeadingOrderViolation([2, 3])).toBe('first heading is h2 at position 1; the page must start at h1')
  // Descending by more than one is legal: a section ending returns to any shallower level.
  expect(firstHeadingOrderViolation([1, 2, 3, 1])).toBeUndefined()
  expect(firstHeadingOrderViolation([])).toBeUndefined()
})

test('clipping tolerates one sub-pixel rounding pixel but not real overflow', () => {
  const boxes: ElementBox[] = [
    { label: 'p.fits', scrollWidth: 300, clientWidth: 300, scrollHeight: 40, clientHeight: 40 },
    { label: 'p.rounding', scrollWidth: 301, clientWidth: 300, scrollHeight: 40, clientHeight: 40 },
    { label: 'p.cut-horizontally', scrollWidth: 420, clientWidth: 300, scrollHeight: 40, clientHeight: 40 },
    { label: 'p.cut-vertically', scrollWidth: 300, clientWidth: 300, scrollHeight: 96, clientHeight: 40 },
  ]

  expect(clippedElements(boxes).map((box) => box.label)).toEqual(['p.cut-horizontally', 'p.cut-vertically'])
})
