import { describe, expect, it } from 'vitest'
import { parseProofUrl } from '../src/proof-url'

describe('parseProofUrl (worker)', () => {
  it('parses an Instagram post', () => {
    expect(parseProofUrl('https://www.instagram.com/p/Cabc/')).toEqual({ platform: 'instagram', id: 'Cabc' })
  })
  it('parses a Threads post', () => {
    expect(parseProofUrl('https://www.threads.net/@u/post/Xyz')).toEqual({ platform: 'threads', id: 'Xyz' })
  })
  it('parses a YouTube watch URL', () => {
    expect(parseProofUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ platform: 'youtube', id: 'dQw4w9WgXcQ' })
  })
  it('parses a youtu.be short link', () => {
    expect(parseProofUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ platform: 'youtube', id: 'dQw4w9WgXcQ' })
  })
  it('parses a YouTube Shorts URL', () => {
    expect(parseProofUrl('https://www.youtube.com/shorts/abc123')).toEqual({ platform: 'youtube', id: 'abc123' })
  })
  it('rejects unsupported', () => {
    expect(parseProofUrl('https://www.tiktok.com/@u/video/123')).toBeNull()
  })
})
