import { describe, it, expect } from 'vitest'
import {
  normalizeInstagram,
  normalizeYouTube,
  normalizeThreads,
  normalize,
} from '../src/normalize'
import { igRaw } from './fixtures/igRaw'
import { ytRaw } from './fixtures/ytRaw'
import { threadsRaw } from './fixtures/threadsRaw'

describe('normalizeInstagram', () => {
  it('extracts handle, followers, bio, and recent_text from raw IG payload', () => {
    const result = normalizeInstagram('fake_traveller_ig', igRaw)
    expect(result.platform).toBe('instagram')
    expect(result.handle).toBe('fake_traveller_ig')
    expect(result.followers).toBe(58200)
    expect(result.bio).toBe('Exploring Asia one plate at a time 🍜 | HK based | IG since 2017')
    expect(result.recent_text).toHaveLength(5)
    expect(result.recent_text[0]).toContain('ramen')
    expect(result.avg_engagement).toBe(2.87)
  })

  it('returns empty recent_text when no posts present', () => {
    const empty = {
      data: {
        user: {
          username: 'blank',
          biography: 'Bio',
          edge_followed_by: { count: 0 },
          edge_media_to_timeline_edge: { edges: [] },
        },
      },
    }
    const result = normalizeInstagram('blank', empty)
    expect(result.recent_text).toEqual([])
    expect(result.followers).toBe(0)
  })

  it('handles missing engagement_rate gracefully', () => {
    const noEngage = {
      data: {
        user: {
          username: 'no_engage',
          biography: 'Bio',
          edge_followed_by: { count: 100 },
          edge_media_to_timeline_edge: { edges: [] },
        },
      },
    }
    const result = normalizeInstagram('no_engage', noEngage)
    expect(result.avg_engagement).toBeUndefined()
  })
})

describe('normalizeYouTube', () => {
  it('extracts channel stats, description, and recent video titles/descriptions', () => {
    const result = normalizeYouTube('@fakefoodtrails', ytRaw)
    expect(result.platform).toBe('youtube')
    expect(result.handle).toBe('@fakefoodtrails')
    expect(result.followers).toBe(124000)
    expect(result.bio).toBe('Weekly video essays about food culture across Asia. Based in Hong Kong. New video every Thursday.')
    expect(result.recent_text).toHaveLength(5)
    expect(result.recent_text[0]).toContain('ramen')
    expect(result.avg_engagement).toBe(1.54)
    expect(result.post_cadence).toBe('1x/week')
  })

  it('combines snippet title and description into recent_text entries', () => {
    const result = normalizeYouTube('@fakefoodtrails', ytRaw)
    // Each recent_text entry should contain both the video title and description
    expect(result.recent_text[0]).toContain('We ate ramen')
    expect(result.recent_text[0]).toContain('Shinjuku ramen district')
  })
})

describe('normalizeThreads', () => {
  it('extracts handle, followers, bio, and thread captions', () => {
    const result = normalizeThreads('fake_traveller_threads', threadsRaw)
    expect(result.platform).toBe('threads')
    expect(result.handle).toBe('fake_traveller_threads')
    expect(result.followers).toBe(9800)
    expect(result.bio).toBe('Food & travel writer. Tokyo → HK. Mostly sharing what I eat.')
    expect(result.recent_text).toHaveLength(5)
    expect(result.recent_text[0]).toContain('soba')
    expect(result.avg_engagement).toBeUndefined()
  })
})

describe('normalize (dispatch)', () => {
  it('dispatches to normalizeInstagram for platform=instagram', () => {
    const result = normalize('instagram', 'fake_traveller_ig', igRaw)
    expect(result.platform).toBe('instagram')
    expect(result.handle).toBe('fake_traveller_ig')
  })

  it('dispatches to normalizeYouTube for platform=youtube', () => {
    const result = normalize('youtube', '@fakefoodtrails', ytRaw)
    expect(result.platform).toBe('youtube')
    expect(result.handle).toBe('@fakefoodtrails')
  })

  it('dispatches to normalizeThreads for platform=threads', () => {
    const result = normalize('threads', 'fake_traveller_threads', threadsRaw)
    expect(result.platform).toBe('threads')
    expect(result.handle).toBe('fake_traveller_threads')
  })
})
