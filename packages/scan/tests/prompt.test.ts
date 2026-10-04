import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/prompt'
import type { NormalizedSignals } from '../src/types'

const igSignal: NormalizedSignals = {
  platform: 'instagram',
  handle: 'fake_traveller_ig',
  followers: 58200,
  avg_engagement: 2.87,
  post_cadence: '3x/week',
  bio: 'Exploring Asia one plate at a time 🍜 | HK based | IG since 2017',
  recent_text: [
    'Hidden ramen spot in Shibuya — queue for 45 min but worth it #tokyo #ramen',
    'Morning dim sum in Sheung Wan. The turnip cake here is unreal 🤍 #hongkong #dimsum',
  ],
}

const ytSignal: NormalizedSignals = {
  platform: 'youtube',
  handle: '@fakefoodtrails',
  followers: 124000,
  avg_engagement: 1.54,
  post_cadence: '1x/week',
  bio: 'Weekly video essays about food culture across Asia.',
  recent_text: [
    'We ate ramen for 3 days straight in Tokyo — worth it? — Full guide to Shinjuku ramen district.',
  ],
}

describe('buildPrompt', () => {
  it('returns an array of exactly two messages: system then user', () => {
    const messages = buildPrompt([igSignal])
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })

  it('system message instructs model to output ONLY JSON', () => {
    const messages = buildPrompt([igSignal])
    const system = messages[0].content
    expect(system.toLowerCase()).toMatch(/json/)
    // Must reference all DNA top-level fields so the model knows the shape
    expect(system).toContain('bio')
    expect(system).toContain('niches')
    expect(system).toContain('content_pillars')
    expect(system).toContain('tone')
    expect(system).toContain('audience')
    expect(system).toContain('platforms')
    expect(system).toContain('languages')
    // verified must always be false — instruct the model
    expect(system).toContain('verified')
    expect(system.toLowerCase()).toContain('false')
  })

  it('user message embeds platform handle and bio', () => {
    const messages = buildPrompt([igSignal])
    const user = messages[1].content
    expect(user).toContain('fake_traveller_ig')
    expect(user).toContain('Exploring Asia one plate at a time')
  })

  it('user message embeds recent_text captions', () => {
    const messages = buildPrompt([igSignal])
    const user = messages[1].content
    expect(user).toContain('Hidden ramen spot in Shibuya')
    expect(user).toContain('dim sum in Sheung Wan')
  })

  it('embeds all signals when multiple platforms provided', () => {
    const messages = buildPrompt([igSignal, ytSignal])
    const user = messages[1].content
    // Both handles should appear
    expect(user).toContain('fake_traveller_ig')
    expect(user).toContain('@fakefoodtrails')
    // Both bios
    expect(user).toContain('Exploring Asia')
    expect(user).toContain('Weekly video essays')
  })

  it('does NOT include any API keys, secrets, or private fields in output', () => {
    const messages = buildPrompt([igSignal, ytSignal])
    const full = messages.map((m) => m.content).join('\n')
    // These strings should never appear in a prompt built from public data
    expect(full).not.toMatch(/apikey|api_key|secret|token|password/i)
  })

  it('accepts an empty signals array and still returns two messages', () => {
    const messages = buildPrompt([])
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })
})
