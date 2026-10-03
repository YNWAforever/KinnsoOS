import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

/**
 * Spec selection for a DEPLOYED target (the post-deploy cutover gate in verify.yml).
 *
 * Membership requires all three of:
 *  - read-only: navigation and GETs only, no form submission, no sign-up, no checkout;
 *  - no dependency on a row count that only the local seed produces;
 *  - no cleanup obligation, because a gate run against production has nowhere to clean up.
 *
 * Deliberately absent, and why — each of these belongs to the hermetic ci.yml stack:
 *  - booking.spec.ts: drives a real Stripe checkout, and its own header records that no
 *    published experience has the open availability row it needs.
 *  - creator-onboarding.spec.ts: signs up a real auth user, runs the paid scan and
 *    publishes a live creator profile, with no teardown.
 *  - destinations-empty-states.spec.ts: submits the sessions waitlist form, and asserts
 *    the exact seeded Tokyo inventory.
 *  - explore-usability.spec.ts: asserts exact result counts (12, then 13) that hold only
 *    for the local seed.
 *  - r7-10-booking.spec.ts: submits the interest-capture form, and unit-tests a config
 *    resolver that is loopback-only by construction.
 *  - profile-enquiries.spec.ts: provisions auth users and shells into the local Postgres
 *    container.
 *  - analytics-consent.spec.ts: guards itself to loopback, so here it would only report
 *    skips.
 *  - r7-10-accessibility.spec.ts / r7-10-contract.spec.ts: run pre-merge against the
 *    hermetic stack at the same commit; their CLS and tab-order assertions are timing
 *    sensitive and would make a deploy gate flaky without adding deploy signal.
 */
export const PROD_SAFE_SPECS = [
  'funnel-smoke.spec.ts',
  'honesty.spec.ts',
  'journey.spec.ts',
  'notfound.spec.ts',
  'r7-10-preview-smoke.spec.ts',
  'redirects.spec.ts',
  'seo.spec.ts',
] as const

export default defineConfig({
  ...baseConfig,
  testMatch: [...PROD_SAFE_SPECS],
})
