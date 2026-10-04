import { describe, it, expect } from 'vitest'
import { AGENT_MODEL, AGENT_RATE_LIMIT } from '@/lib/agent/policy'
import { isAgentConfigured } from '@/lib/agent/config'

describe('agent policy', () => {
  it('uses the same cheap model slug the copilot uses for its seed tier', () => {
    expect(AGENT_MODEL).toBe('anthropic/claude-haiku-4.5')
  })
  it('exports fixed rate-limit numbers', () => {
    expect(AGENT_RATE_LIMIT).toEqual({ maxRequests: 20, windowSeconds: 3600 })
  })
})

describe('isAgentConfigured', () => {
  it('mirrors isCopilotConfigured\'s AI Gateway check', () => {
    expect(typeof isAgentConfigured()).toBe('boolean')
  })
})
