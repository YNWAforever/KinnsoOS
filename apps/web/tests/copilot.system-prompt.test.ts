import { describe, it, expect } from 'vitest'
import { buildCopilotSystemPrompt } from '@/lib/copilot/system-prompt'
import type { Dna } from '@kinnso/scan'

const dna: Dna = {
  bio: 'Solo travel creator',
  niches: ['budget travel', 'japan'],
  content_pillars: ['itineraries', 'food'],
  tone: ['warm', 'practical'],
  audience: { top_geos: ['HK', 'TW'], top_locales: ['zh-HK'] },
  platforms: [{ platform: 'instagram', followers: 12000, verified: false }],
  languages: ['zh-HK', 'en'],
}

describe('buildCopilotSystemPrompt', () => {
  it('includes the creator niches, pillars, and tone', () => {
    const s = buildCopilotSystemPrompt(dna, 'en')
    expect(s).toContain('budget travel')
    expect(s).toContain('itineraries')
    expect(s).toContain('warm')
  })

  it('states the active locale so the agent replies in the creators language', () => {
    expect(buildCopilotSystemPrompt(dna, 'zh-hk')).toContain('zh-hk')
  })

  it('includes a safety clause about treating tool results as untrusted data', () => {
    expect(buildCopilotSystemPrompt(dna, 'en').toLowerCase()).toContain('untrusted')
  })

  it('omits empty sections instead of printing empty labels', () => {
    const bare: Dna = { ...dna, content_pillars: [], tone: [], audience: {}, languages: [] }
    const s = buildCopilotSystemPrompt(bare, 'en')
    expect(s).not.toContain('Content pillars:')
    expect(s).not.toContain('Tone:')
  })
})
