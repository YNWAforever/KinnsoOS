import { readdir } from 'node:fs/promises'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  A11Y_EXCEPTIONS,
  AXE_EXCEPTIONS,
  formatAxeViolations,
  unapprovedViolations,
} from '../r7-10-accessibility'
import { R7_10_OFF_SPECS, R7_10_PREVIEW_SPECS } from '../r7-10-specs'
import { R7_10_ROUTES } from '../r7-10-routes'

test('R7.10 route manifest declares the exact browser coverage contract', () => {
  expect(R7_10_ROUTES).toHaveLength(9)
  expect(R7_10_ROUTES.map((route) => route.path)).toEqual([
    '/en',
    '/en/explore',
    '/en/g/r7-smoke-tokyo-guide',
    '/en/experiences/r7-smoke-tokyo-experience',
    '/en/articles/dining/ramen-guide',
    '/en/for-creators',
    '/en/for-merchants',
    '/en/creators',
    '/en/merchants',
  ])
  expect(new Set(R7_10_ROUTES.map((route) => route.id)).size).toBe(R7_10_ROUTES.length)
  expect(new Set(R7_10_ROUTES.map((route) => route.path)).size).toBe(R7_10_ROUTES.length)
  expect(R7_10_ROUTES.every((route) => route.ready.role === 'heading' && route.ready.level === 1)).toBe(true)
})

test('R7.10 axe exception ledger starts empty', () => {
  expect(AXE_EXCEPTIONS).toEqual([])
})

test('R7.10 axe filtering removes only exactly approved nodes', () => {
  const violation = {
    id: 'color-contrast',
    impact: 'serious',
    help: 'Elements must meet minimum color contrast ratio thresholds',
    nodes: [
      { target: ['main', '.approved-node'] },
      { target: ['main', '.unapproved-node'] },
    ],
  } as const
  const exceptions = [
    {
      routeId: 'home' as const,
      ruleId: 'color-contrast',
      target: 'main > .approved-node',
      reason: 'Recorded for a scoped fixture',
      owner: 'Accessibility',
      reviewWhen: 'Before release',
    },
  ]

  const remaining = unapprovedViolations('home', [violation], exceptions)

  expect(remaining).toHaveLength(1)
  expect(remaining[0]?.nodes).toEqual([{ target: ['main', '.unapproved-node'] }])
  expect(formatAxeViolations('home', remaining)).toBe(
    '[home] color-contrast (serious) at main > .unapproved-node: Elements must meet minimum color contrast ratio thresholds',
  )
})

test('R7.10 axe helpers accept direct axe results', () => {
  type AxeViolations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations']
  const axeViolations = [] as AxeViolations

  expect(unapprovedViolations('home', axeViolations)).toEqual([])
})

// Exact contents, not a permissive shape or an imported expected constant.
// The original nine text-200 failures now have mandatory browser regressions.
test('R7.10 a11y exception ledger stays empty after the text-200 fixes', () => {
  expect(A11Y_EXCEPTIONS).toEqual([])
})

test('every a11y exception carries a reason, an owner and a review date', () => {
  for (const entry of A11Y_EXCEPTIONS) {
    expect(entry.reason.trim(), `${entry.routeId}/${entry.check} needs a reason`).not.toBe('')
    expect(entry.owner.trim(), `${entry.routeId}/${entry.check} needs an owner`).not.toBe('')
    expect(entry.reviewWhen.trim(), `${entry.routeId}/${entry.check} needs a review date`).not.toBe('')
  }
})

// A spec file that no config selects runs nowhere and protects nothing. That has
// already happened here once: r7-10-accessibility-review.spec.ts matched only the
// default config, which nothing runs any more. This makes it a failure, not a silence.
test('every R7.10 spec on disk is selected by a config', async () => {
  const names = (await readdir(new URL('.', import.meta.url)))
    .filter((name) => /^r7-10-.*\.spec\.ts$/.test(name))
    .sort()

  expect(names.length, 'scan matched nothing — glob or path is wrong').toBeGreaterThan(3)

  const registered = new Set<string>([...R7_10_OFF_SPECS, ...R7_10_PREVIEW_SPECS])
  expect(names.filter((name) => !registered.has(name))).toEqual([])
})
