import { describe, it, expect } from 'vitest'
import { DnaSchema, PlatformEnum } from '../src/schema'

const validDna = {
  bio: 'Travel photographer based in Tokyo.',
  niches: ['travel', 'street photography'],
  content_pillars: ['destination guides', 'gear reviews'],
  tone: ['warm', 'informative'],
  audience: {
    top_geos: ['JP', 'HK'],
    top_locales: ['ja', 'zh-HK'],
  },
  platforms: [
    {
      platform: 'instagram',
      followers: 42000,
      avg_engagement: 3.2,
      post_cadence: '3x/week',
      verified: false,
    },
  ],
  languages: ['ja', 'en'],
}

describe('PlatformEnum', () => {
  it('accepts valid platform values', () => {
    expect(PlatformEnum.parse('instagram')).toBe('instagram')
    expect(PlatformEnum.parse('youtube')).toBe('youtube')
    expect(PlatformEnum.parse('threads')).toBe('threads')
  })

  it('rejects unknown platform', () => {
    expect(() => PlatformEnum.parse('tiktok')).toThrow()
  })
})

describe('DnaSchema', () => {
  it('parses a fully populated valid DNA object', () => {
    const result = DnaSchema.parse(validDna)
    expect(result.bio).toBe('Travel photographer based in Tokyo.')
    expect(result.niches).toEqual(['travel', 'street photography'])
    expect(result.platforms[0].platform).toBe('instagram')
    expect(result.platforms[0].verified).toBe(false)
  })

  it('allows optional platform signal fields', () => {
    const minimal = {
      ...validDna,
      platforms: [{ platform: 'threads', verified: false }],
    }
    const result = DnaSchema.parse(minimal)
    expect(result.platforms[0].followers).toBeUndefined()
    expect(result.platforms[0].avg_engagement).toBeUndefined()
  })

  it('allows empty audience optional fields', () => {
    const noGeos = { ...validDna, audience: {} }
    const result = DnaSchema.parse(noGeos)
    expect(result.audience.top_geos).toBeUndefined()
  })

  it('rejects verified:true — always false in v1', () => {
    const bad = {
      ...validDna,
      platforms: [{ platform: 'instagram', verified: true }],
    }
    expect(() => DnaSchema.parse(bad)).toThrow()
  })

  it('rejects missing bio', () => {
    const { bio: _bio, ...noBio } = validDna
    expect(() => DnaSchema.parse(noBio)).toThrow()
  })

  it('rejects negative followers', () => {
    const bad = {
      ...validDna,
      platforms: [{ platform: 'instagram', followers: -1, verified: false }],
    }
    expect(() => DnaSchema.parse(bad)).toThrow()
  })

  it('rejects negative avg_engagement', () => {
    const bad = {
      ...validDna,
      platforms: [{ platform: 'youtube', avg_engagement: -0.1, verified: false }],
    }
    expect(() => DnaSchema.parse(bad)).toThrow()
  })
})
