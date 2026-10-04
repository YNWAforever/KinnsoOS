import { describe, it, expect } from 'vitest'
import {
  initialsFrom,
  buildStudioIdentity,
  buildDemoIdentity,
  type HandleRow,
} from '@/lib/studio/identity'
import { getCreator } from '@/lib/creator-mock'
import type { Dna } from '@kinnso/scan'

const dna: Dna = {
  bio: 'Tokyo on foot.',
  niches: ['Coffee'],
  content_pillars: ['Cafés'],
  tone: ['calm'],
  audience: { top_geos: ['HK'], top_locales: ['zh-HK'] },
  platforms: [
    { platform: 'instagram', followers: 27400, avg_engagement: 0.06, verified: false },
    { platform: 'youtube', verified: false },
  ],
  languages: ['en'],
}

describe('initialsFrom', () => {
  it('takes first+last initials for multi-word names', () => {
    expect(initialsFrom('May Wanders')).toBe('MW')
  })
  it('takes the first two letters for single-word names', () => {
    expect(initialsFrom('maywong')).toBe('MA')
  })
  it('falls back to "C" for an empty name', () => {
    expect(initialsFrom('   ')).toBe('C')
  })
})

describe('buildStudioIdentity', () => {
  const handles: HandleRow[] = [
    { platform: 'youtube', handle: 'maytube', url: null },
    { platform: 'instagram', handle: 'maygram', url: null },
  ]

  it('prefers display_name for the name', () => {
    const id = buildStudioIdentity({ display_name: 'May Wong' }, handles, dna, '2026-06-01T10:00:00Z')
    expect(id.name).toBe('May Wong')
    expect(id.avatarInitials).toBe('MW')
  })

  it('prefers the instagram handle as the primary handle', () => {
    const id = buildStudioIdentity({ display_name: null }, handles, dna, '2026-06-01T10:00:00Z')
    expect(id.handle).toBe('maygram')
  })

  it('falls back name → handle when display_name is null', () => {
    const id = buildStudioIdentity({ display_name: null }, handles, dna, '2026-06-01T10:00:00Z')
    expect(id.name).toBe('maygram')
  })

  it('falls back to "Creator" when there is no name and no handle', () => {
    const id = buildStudioIdentity({ display_name: null }, [], dna, '2026-06-01T10:00:00Z')
    expect(id.name).toBe('Creator')
    expect(id.handle).toBe('Creator')
  })

  it('maps dna.platforms to followers (count optional) and slices lastScanned to a date', () => {
    const id = buildStudioIdentity({ display_name: 'May Wong' }, handles, dna, '2026-06-01T10:00:00Z')
    expect(id.followers).toEqual([
      { platform: 'instagram', count: 27400 },
      { platform: 'youtube', count: undefined },
    ])
    expect(id.lastScanned).toBe('2026-06-01')
  })
})

describe('buildDemoIdentity', () => {
  it('derives identity from the mock creator and injected date', () => {
    const creator = getCreator('maywanders')!
    const id = buildDemoIdentity(creator, '2026-06-16T00:00:00Z')
    expect(id.name).toBe(creator.name)
    expect(id.handle).toBe(creator.handle)
    expect(id.lastScanned).toBe('2026-06-16')
    expect(id.followers[0]).toEqual({ platform: 'instagram', count: creator.followerIg })
    expect(id.followers.some((f) => f.platform === 'threads')).toBe(true)
  })
})
