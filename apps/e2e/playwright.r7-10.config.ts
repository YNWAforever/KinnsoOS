import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'
import { resolveR710LocalConfig } from './r7-10-local'
import { R7_10_OFF_SPECS } from './r7-10-specs'

function localEnv() {
  const values: Record<string, string> = {}
  const source = readFileSync(resolve(import.meta.dirname, '../web/.env.local'), 'utf8')
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return values
}

const bookingState = process.env.R7_10_BOOKING_STATE ?? 'off'
const port = bookingState === 'on' ? 3101 : 3100
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`
const local = resolveR710LocalConfig({
  ...localEnv(),
  ...process.env,
  R7_10_LOCAL: '1',
  R7_10_BOOKING_STATE: bookingState,
  E2E_BASE_URL: baseURL,
})

Object.assign(process.env, {
  R7_10_LOCAL: '1',
  R7_10_BOOKING_STATE: local.bookingState,
  BOOKING_LIVE: local.bookingLive,
  E2E_BASE_URL: local.baseURL,
  NEXT_PUBLIC_SUPABASE_URL: local.supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
})

export default defineConfig({
  ...baseConfig,
  testMatch: local.bookingState === 'on' ? 'r7-10-booking.spec.ts' : [...R7_10_OFF_SPECS],
  use: { ...baseConfig.use, baseURL: local.baseURL },
  webServer: {
    command: `pnpm --filter web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: local.baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
      NEXT_PUBLIC_SITE_URL: local.baseURL,
      AGENT_LIVE: 'true',
      BOOKING_LIVE: local.bookingState === 'on' ? 'true' : 'false',
      VERCEL: '1',
      ...(local.bookingState === 'on' ? {
        STRIPE_SECRET_KEY: local.stripeSecretKey,
        STRIPE_WEBHOOK_SECRET: local.stripeWebhookSecret,
      } : {}),
    },
  },
})
