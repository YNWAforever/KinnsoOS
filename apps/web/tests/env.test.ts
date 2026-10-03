// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStripeSecretKey, getSupabasePublicEnv, validateBuildEnv } from '@/lib/env'

const core = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test',
  AGENT_LIVE: 'false',
}

describe('R7 environment validation', () => {
  it('uses a relative product-state import that the Next config loader can resolve', () => {
    const source = readFileSync(join(process.cwd(), 'lib/env.ts'), 'utf8')

    expect(source).toContain("from './product-state-config'")
    expect(source).not.toContain("from '@/lib/product-state-config'")
  })

  it('names a missing core variable without echoing values', () => {
    expect(() => validateBuildEnv({ NEXT_PUBLIC_SUPABASE_URL: 'secret-url-value' }))
      .toThrow('core web: missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY')
    try { validateBuildEnv({ NEXT_PUBLIC_SUPABASE_URL: 'secret-url-value' }) } catch (error) {
      expect(String(error)).not.toContain('secret-url-value')
    }
  })

  it('accepts server-name fallbacks for Supabase', () => {
    expect(getSupabasePublicEnv({ SUPABASE_URL: 'https://server.test', SUPABASE_ANON_KEY: 'anon' }))
      .toEqual({ url: 'https://server.test', anonKey: 'anon' })
  })

  it('requires the complete Stripe surface only when booking is live', () => {
    expect(() => validateBuildEnv({ ...core, BOOKING_LIVE: 'false' })).not.toThrow()
    expect(() => validateBuildEnv({ ...core, BOOKING_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_test_x' }))
      .toThrow('booking: missing STRIPE_WEBHOOK_SECRET')
    expect(() => validateBuildEnv({
      ...core, BOOKING_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x', NEXT_PUBLIC_SITE_URL: 'https://www.kinnso.ai',
    })).not.toThrow()
  })

  it('accepts Vercel runtime identity or an explicit AI key for a live agent', () => {
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: 'true' }))
      .toThrow('agent: missing AI_GATEWAY_API_KEY or VERCEL=1')
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: 'true', VERCEL: '1' })).not.toThrow()
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: 'true', AI_GATEWAY_API_KEY: 'ai-key' })).not.toThrow()
  })

  it('requires AI or Vercel configuration when the Agent flag is absent', () => {
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: undefined }))
      .toThrow('agent: missing AI_GATEWAY_API_KEY or VERCEL=1')
  })

  it('does not require AI or Vercel configuration when Agent is explicitly disabled', () => {
    expect(() => validateBuildEnv(core)).not.toThrow()
  })

  it('rejects invalid configured values before provider validation', () => {
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: 'yes' }))
      .toThrow('AGENT_LIVE must be true or false')
    expect(() => validateBuildEnv({ ...core, BOOKING_LIVE: 'yes' }))
      .toThrow('BOOKING_LIVE must be true or false')
  })

  it('returns a named Stripe runtime failure', () => {
    expect(() => getStripeSecretKey({})).toThrow('booking: missing STRIPE_SECRET_KEY')
  })
})
