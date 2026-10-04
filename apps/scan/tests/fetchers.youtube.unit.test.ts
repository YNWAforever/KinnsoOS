import { afterEach, describe, expect, it, vi } from 'vitest'
import { YouTubeFetcher } from '../src/fetchers'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('YouTubeFetcher.fetchVideoAuthor', () => {
  it('returns channelId, customUrl handle, and engagement for a video', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/videos')) {
        return jsonResponse({ items: [{ snippet: { channelId: 'UCabc' }, statistics: { likeCount: '42', viewCount: '1000' } }] })
      }
      if (url.includes('/channels')) {
        return jsonResponse({ items: [{ snippet: { customUrl: '@traveler' } }] })
      }
      return jsonResponse({}, false, 404)
    })
    vi.stubGlobal('fetch', fetchMock)
    const f = new YouTubeFetcher('key')
    expect(await f.fetchVideoAuthor('vid123')).toEqual({
      authorHandle: '@traveler',
      authorId: 'UCabc',
      engagementCount: 42,
      postUrl: 'https://www.youtube.com/watch?v=vid123',
    })
  })

  it('returns null when the video has no channelId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })))
    expect(await new YouTubeFetcher('key').fetchVideoAuthor('vid')).toBeNull()
  })

  it('still returns the id-only result when the channel customUrl call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/videos')
        ? jsonResponse({ items: [{ snippet: { channelId: 'UCabc' }, statistics: {} }] })
        : jsonResponse({}, false, 500),
    ))
    const post = await new YouTubeFetcher('key').fetchVideoAuthor('vid')
    expect(post).toEqual({ authorHandle: null, authorId: 'UCabc', engagementCount: null, postUrl: 'https://www.youtube.com/watch?v=vid' })
  })
})

describe('YouTubeFetcher.resolveChannelId', () => {
  it('resolves a handle to a channel id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [{ id: 'UCabc' }] })))
    expect(await new YouTubeFetcher('key').resolveChannelId('@traveler')).toBe('UCabc')
  })
  it('returns null when no channel matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })))
    expect(await new YouTubeFetcher('key').resolveChannelId('@nobody')).toBeNull()
  })
})
