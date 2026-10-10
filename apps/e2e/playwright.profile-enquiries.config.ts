import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'
import {
  PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET,
  resolveProfileEnquiriesLocalConfig,
} from './profile-enquiries-local'

function localTestEnv() {
  const values: Record<string, string> = {}
  const source = readFileSync(resolve(import.meta.dirname, '../web/.env.test'), 'utf8')
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return values
}

// Resolve before defineConfig/webServer construction: without this explicit
// opt-in and loopback validation, the local fixture must never start.
const local = resolveProfileEnquiriesLocalConfig({ ...localTestEnv(), ...process.env })
const port = new URL(local.baseURL).port || '3000'

Object.assign(process.env, {
  SUPABASE_URL: local.supabaseUrl,
  SUPABASE_ANON_KEY: local.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
  SUPABASE_DB_CONTAINER: local.dbContainer,
})

export default defineConfig({
  ...baseConfig,
  testMatch: 'profile-enquiries.spec.ts',
  use: { ...baseConfig.use, baseURL: local.baseURL },
  webServer: {
    command: `pnpm --filter web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: local.baseURL,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
      ENQUIRY_SUBMISSION_SECRET: PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET,
      VERCEL: '1',
    },
  },
})
