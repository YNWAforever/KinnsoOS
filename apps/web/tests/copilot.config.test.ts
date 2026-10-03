import { describe, it, expect, afterEach } from 'vitest'
import { isCopilotConfigured } from '@/lib/copilot/config'

const saved = { key: process.env.AI_GATEWAY_API_KEY, vercel: process.env.VERCEL }
afterEach(() => {
  process.env.AI_GATEWAY_API_KEY = saved.key
  process.env.VERCEL = saved.vercel
})

describe('isCopilotConfigured', () => {
  it('is true when a gateway key is set', () => {
    process.env.AI_GATEWAY_API_KEY = 'k'
    delete process.env.VERCEL
    expect(isCopilotConfigured()).toBe(true)
  })
  it('is true on Vercel even without a key (OIDC)', () => {
    delete process.env.AI_GATEWAY_API_KEY
    process.env.VERCEL = '1'
    expect(isCopilotConfigured()).toBe(true)
  })
  it('is false with neither key nor Vercel', () => {
    delete process.env.AI_GATEWAY_API_KEY
    delete process.env.VERCEL
    expect(isCopilotConfigured()).toBe(false)
  })
})
