// apps/web/tests/sessions.embed.test.ts
import { describe, it, expect } from 'vitest'
import { parseSessionEmbedUrl } from '@/lib/sessions/embed'

describe('parseSessionEmbedUrl', () => {
  it('accepts a youtube.com/watch URL', () => {
    const r = parseSessionEmbedUrl('https://www.youtube.com/watch?v=abc123XYZ_-')
    expect(r).toEqual({
      id: 'abc123XYZ_-',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc123XYZ_-',
      watchUrl: 'https://www.youtube.com/watch?v=abc123XYZ_-',
    })
  })

  it('accepts youtube.com/live/<id> and youtube.com/embed/<id>', () => {
    expect(parseSessionEmbedUrl('https://youtube.com/live/liveId123')?.id).toBe('liveId123')
    expect(parseSessionEmbedUrl('https://youtube.com/embed/embedId456')?.id).toBe('embedId456')
  })

  it('accepts a youtu.be short URL', () => {
    expect(parseSessionEmbedUrl('https://youtu.be/shortId789')?.id).toBe('shortId789')
  })

  it('rejects non-YouTube hosts (Zoom, Vimeo, generic sites)', () => {
    expect(parseSessionEmbedUrl('https://zoom.us/j/1234567890')).toBeNull()
    expect(parseSessionEmbedUrl('https://vimeo.com/123456789')).toBeNull()
    expect(parseSessionEmbedUrl('https://example.com/video')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseSessionEmbedUrl('not a url')).toBeNull()
    expect(parseSessionEmbedUrl('')).toBeNull()
  })

  it('rejects a youtube.com/watch URL with no v= param', () => {
    expect(parseSessionEmbedUrl('https://www.youtube.com/watch')).toBeNull()
  })
})
