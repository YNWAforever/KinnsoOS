import { describe, it, expect } from 'vitest'
import { parseDna, minViable } from '../src/parse'
import type { Dna } from '../src/schema'

const healthyDna: Dna = {
  bio: 'Travel photographer based in Tokyo.',
  niches: ['travel', 'food'],
  content_pillars: ['destination guides'],
  tone: ['warm', 'informative'],
  audience: { top_geos: ['JP', 'HK'], top_locales: ['ja', 'zh-HK'] },
  platforms: [{ platform: 'instagram', followers: 42000, avg_engagement: 3.2, verified: false }],
  languages: ['ja', 'en'],
}

const healthyJson = JSON.stringify(healthyDna)

describe('minViable', () => {
  it('returns true when bio is non-empty and niches is non-empty', () => {
    expect(minViable(healthyDna)).toBe(true)
  })

  it('returns true when bio is non-empty and content_pillars is non-empty (no niches)', () => {
    const noNiches: Dna = { ...healthyDna, niches: [] }
    expect(minViable(noNiches)).toBe(true)
  })

  it('returns false when bio is empty string', () => {
    const emptyBio: Dna = { ...healthyDna, bio: '' }
    expect(minViable(emptyBio)).toBe(false)
  })

  it('returns false when bio is only whitespace', () => {
    const whitespaceBio: Dna = { ...healthyDna, bio: '   ' }
    expect(minViable(whitespaceBio)).toBe(false)
  })

  it('returns false when both niches and content_pillars are empty', () => {
    const noTopics: Dna = { ...healthyDna, niches: [], content_pillars: [] }
    expect(minViable(noTopics)).toBe(false)
  })
})

describe('parseDna', () => {
  it('parses a clean JSON string and returns thin:false for a healthy DNA', () => {
    const { dna, thin } = parseDna(healthyJson)
    expect(dna.bio).toBe('Travel photographer based in Tokyo.')
    expect(dna.niches).toEqual(['travel', 'food'])
    expect(thin).toBe(false)
  })

  it('tolerates JSON wrapped in ```json code fences', () => {
    const fenced = `\`\`\`json\n${healthyJson}\n\`\`\``
    const { dna, thin } = parseDna(fenced)
    expect(dna.bio).toBe('Travel photographer based in Tokyo.')
    expect(thin).toBe(false)
  })

  it('tolerates JSON wrapped in plain ``` code fences', () => {
    const fenced = `\`\`\`\n${healthyJson}\n\`\`\``
    const { dna } = parseDna(fenced)
    expect(dna.bio).toBe('Travel photographer based in Tokyo.')
  })

  it('tolerates leading/trailing whitespace around the JSON', () => {
    const { dna } = parseDna(`\n   ${healthyJson}   \n`)
    expect(dna.bio).toBe('Travel photographer based in Tokyo.')
  })

  it('sets thin:true when bio is empty (thin-signal case)', () => {
    const thinDna = { ...healthyDna, bio: '' }
    const { thin } = parseDna(JSON.stringify(thinDna))
    expect(thin).toBe(true)
  })

  it('sets thin:true when both niches and content_pillars are empty', () => {
    const thinDna = { ...healthyDna, niches: [], content_pillars: [] }
    const { thin } = parseDna(JSON.stringify(thinDna))
    expect(thin).toBe(true)
  })

  it('throws a clear error when the text contains no valid JSON object', () => {
    expect(() => parseDna('Sorry, I cannot help with that.')).toThrow(/no JSON object found/i)
  })

  it('throws a clear error when JSON is present but malformed', () => {
    expect(() => parseDna('{bio: missing quotes}')).toThrow()
  })

  it('throws a clear zod error when JSON is valid but fails schema validation (verified:true)', () => {
    const bad = {
      ...healthyDna,
      platforms: [{ platform: 'instagram', verified: true }],
    }
    expect(() => parseDna(JSON.stringify(bad))).toThrow()
  })

  it('throws a clear zod error when bio field is missing entirely', () => {
    const { bio: _bio, ...noBio } = healthyDna
    expect(() => parseDna(JSON.stringify(noBio))).toThrow()
  })
})
