/**
 * Which spec files each R7.10 Playwright config selects.
 *
 * A plain data module with no imports and no side effects, deliberately: importing
 * playwright.r7-10.config.ts reads apps/web/.env.local and mutates process.env, so a
 * test that only wants to check this list must not have to load all of that.
 *
 * r7-10-contract.spec.ts asserts every r7-10-*.spec.ts on disk appears in one of these
 * two lists.
 */

/** Selected by playwright.r7-10.config.ts when R7_10_BOOKING_STATE is not 'on'. */
export const R7_10_OFF_SPECS = [
  'creator-onboarding.spec.ts',
  'e2e-target.spec.ts',
  'funnel-smoke.spec.ts',
  'funnel-fixture.spec.ts',
  'honesty.spec.ts',
  'notfound.spec.ts',
  'r7-10-contract.spec.ts',
  'r7-10-accessibility.spec.ts',
  // Helper-level coverage for r7-10-accessibility.ts (axe formatting, the CLS
  // session-window calculation, focus-indicator detection). It matched only the
  // default config, which nothing runs any more, so it executed nowhere.
  'r7-10-accessibility-review.spec.ts',
  'r7-10-booking.spec.ts',
  'r7-10-booking-fixture.spec.ts',
  // The story 21 suites. Registered ahead of being written, deliberately: the guard
  // checks that disk is a SUBSET of this list, so naming a file early is harmless,
  // whereas forgetting to add it later is the exact failure this module exists to
  // prevent. Absent from disk until tasks 6-8 of
  // docs/superpowers/plans/2026-09-12-story-21-accessibility-verification.md land.
  'r7-10-keyboard.spec.ts',
  'r7-10-reflow.spec.ts',
  'r7-10-structure.spec.ts',
] as const

/**
 * Selected by the preview config for the read-only smoke in verify.yml, NOT by
 * playwright.r7-10.config.ts — which is why this is a separate list rather than a
 * forgotten entry in the one above. Nothing reads it except the registration guard,
 * which needs it to know the file is not orphaned.
 */
export const R7_10_PREVIEW_SPECS = ['r7-10-preview-smoke.spec.ts'] as const
