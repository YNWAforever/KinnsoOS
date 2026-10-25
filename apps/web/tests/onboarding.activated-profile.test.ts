import { describe, expect, it } from 'vitest'
import type { Dna } from '@kinnso/scan'
import { classifyActivatedProfile } from '@/lib/onboarding/activated-profile'

const published: Dna = {
  bio: 'Travel photographer based in Tokyo.',
  niches: ['travel'],
  content_pillars: ['guides'],
  tone: ['warm'],
  audience: {},
  platforms: [{ platform: 'instagram', verified: false }],
  languages: ['en'],
}

describe('classifyActivatedProfile', () => {
  it('treats a schema-valid final as the published profile and ignores a newer draft', () => {
    const draft = { ...published, bio: 'Unconfirmed draft' }
    expect(classifyActivatedProfile(published, draft)).toEqual({ kind: 'published', dna: published })
  })

  it('does not treat a missing, null, or invalid final as published', () => {
    expect(classifyActivatedProfile(null, null)).toEqual({ kind: 'unpublished', draft: null })
    expect(classifyActivatedProfile(undefined, {})).toEqual({ kind: 'unpublished', draft: null })
    expect(classifyActivatedProfile({ bio: 'missing the rest' }, null)).toEqual({ kind: 'unpublished', draft: null })
  })

  it('keeps a schema-valid AI draft available without calling it published', () => {
    expect(classifyActivatedProfile(null, published)).toEqual({ kind: 'unpublished', draft: published })
  })
})
