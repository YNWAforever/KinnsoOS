import { expect, test } from '@playwright/test'
import { tabTo } from '../r7-10-accessibility'
import { resolveR710LocalConfig } from '../r7-10-local'
import { FIXTURES } from '../fixtures'
import { assertBookingFixturePage, assertBookingFixtureProjection } from '../r7-10-booking-fixture'

const LOCAL_ENV = {
  R7_10_LOCAL: '1',
  R7_10_BOOKING_STATE: 'off',
  E2E_BASE_URL: 'http://127.0.0.1:3100',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-key',
}

test('R7.10 local booking config rejects unsafe environments', () => {
  expect(resolveR710LocalConfig(LOCAL_ENV)).toMatchObject({
    bookingState: 'off',
    baseURL: 'http://127.0.0.1:3100',
    supabaseUrl: 'http://127.0.0.1:54321',
  })
  expect(() => resolveR710LocalConfig({ ...LOCAL_ENV, E2E_BASE_URL: 'https://kinnso.com' }))
    .toThrow('E2E_BASE_URL must be loopback')
  expect(() => resolveR710LocalConfig({ ...LOCAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }))
    .toThrow('NEXT_PUBLIC_SUPABASE_URL must be loopback')
  expect(() => resolveR710LocalConfig({ ...LOCAL_ENV, R7_10_BOOKING_STATE: 'on' }))
    .toThrow('STRIPE_SECRET_KEY is required for Booking ON')
  expect(() => resolveR710LocalConfig({
    ...LOCAL_ENV,
    R7_10_BOOKING_STATE: 'on',
    STRIPE_SECRET_KEY: 'sk_live_unsafe',
    STRIPE_WEBHOOK_SECRET: 'whsec_local',
  })).toThrow('STRIPE_SECRET_KEY must start with sk_test_')
})


test('R7.10 local booking config pins runner booking state', () => {
  expect(resolveR710LocalConfig(LOCAL_ENV)).toMatchObject({
    bookingState: 'off',
    bookingLive: 'false',
  })
  expect(resolveR710LocalConfig({
    ...LOCAL_ENV,
    R7_10_BOOKING_STATE: 'on',
    STRIPE_SECRET_KEY: 'sk_test_local',
    STRIPE_WEBHOOK_SECRET: 'whsec_local',
  })).toMatchObject({
    bookingState: 'on',
    bookingLive: 'true',
  })
})
test('Booking OFF submits interest capture entirely by keyboard', async ({ page }) => {
  test.skip(process.env.R7_10_BOOKING_STATE === 'on', 'Interest-capture form only renders when booking is off')

  const response = await page.goto(FIXTURES.seoEntities.experiencePath)
  await assertBookingFixturePage(page, response)

  await tabTo(page, page.getByLabel('Email'))
  await page.keyboard.type('r710-accessibility@kinnso.test')
  await tabTo(page, page.getByRole('button', { name: 'Get notified when booking opens', exact: true }))
  await page.keyboard.press('Enter')

  await expect(page.getByRole('status')).toContainText(/you.re on the list/i)
})

test('Booking ON enters Stripe test checkout entirely by keyboard', async ({ page }, testInfo) => {
  test.skip(process.env.R7_10_BOOKING_STATE !== 'on', 'Booking ON journey runs only in the isolated Stripe test-mode invocation')

  await assertBookingFixtureProjection(testInfo)

  const response = await page.goto(FIXTURES.seoEntities.experiencePath)
  await assertBookingFixturePage(page, response)

  const date = page.getByLabel(/choose a date/i)
  await tabTo(page, date)
  await page.keyboard.press('Home')
  await page.keyboard.press('Tab')
  await tabTo(page, page.getByLabel('Email'))
  await page.keyboard.type('r710-accessibility@kinnso.test')
  await tabTo(page, page.getByRole('button', { name: /book now/i }))
  await page.keyboard.press('Enter')

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
})
