import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RapidApiFetcher, YouTubeFetcher, FakeFetcher, FAKE_PAYLOADS } from '../src/fetchers'
import { normalize } from '@kinnso/scan'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeErrorResponse(status: number): Response {
  return new Response('error', { status })
}

// ---------------------------------------------------------------------------
// RapidApiFetcher
// ---------------------------------------------------------------------------

describe('RapidApiFetcher', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws on construction when apiKey is empty', () => {
    expect(() => new RapidApiFetcher('')).toThrow('RAPIDAPI_KEY is required')
  })

  it('sends correct x-rapidapi-key and x-rapidapi-host headers for instagram', async () => {
    // instagram makes two calls (profile, then posts for captions); both ok here.
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    const f = new RapidApiFetcher('test-api-key')
    await f.fetch('instagram', 'some_handle')
    // calls[0] is the profile endpoint.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('ig_get_fb_profile_v3.php')
    expect(url).toContain('instagram-scraper-stable-api.p.rapidapi.com')
    // instagram uses the POST form endpoint; the handle travels in the body.
    expect(init.method).toBe('POST')
    expect(String(init.body)).toContain('some_handle')
    const headers = init.headers as Record<string, string>
    expect(headers['x-rapidapi-key']).toBe('test-api-key')
    expect(headers['x-rapidapi-host']).toBe('instagram-scraper-stable-api.p.rapidapi.com')
  })

  it('sends correct host for threads', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeOkResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    const f = new RapidApiFetcher('test-api-key')
    await f.fetch('threads', 'threads_handle')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('threads-scraper-api2.p.rapidapi.com')
    const headers = init.headers as Record<string, string>
    expect(headers['x-rapidapi-host']).toBe('threads-scraper-api2.p.rapidapi.com')
  })

  it('throws on non-retryable 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(404)))
    const f = new RapidApiFetcher('key')
    await expect(f.fetch('instagram', 'no_user')).rejects.toThrow('HTTP 404')
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeOkResponse({ data: { followers_count: 100 } }))
      .mockResolvedValueOnce(makeOkResponse({ posts: [] })) // posts-captions call
    vi.stubGlobal('fetch', fetchMock)
    // profile retries once (429 -> ok) = 2 calls, then the posts call = 3 total
    const result = await new RapidApiFetcher('key').fetch('instagram', 'user')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // The fetcher reshapes the provider response into the normalizer-expected
    // nested shape (data.user.edge_followed_by.count).
    expect(result).toMatchObject({ data: { user: { edge_followed_by: { count: 100 } } } })
  }, 10_000)

  it('paginates instagram posts and merges captions across pages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeOkResponse({ biography: 'b', follower_count: 5 })) // profile
      .mockResolvedValueOnce(
        makeOkResponse({ posts: [{ node: { caption: { text: 'cap1' } } }], pagination_token: 'tok2' }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({ posts: [{ node: { caption: { text: 'cap2' } } }], pagination_token: '' }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const result = (await new RapidApiFetcher('key').fetch('instagram', 'u')) as {
      data: { user: { edge_media_to_timeline_edge: { edges: Array<{ node: { edge_media_to_caption: { edges: Array<{ node: { text: string } }> } } }> } } }
    }
    // 1 profile call + 2 post pages
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // page 2 must carry the cursor returned by page 1
    expect(String((fetchMock.mock.calls[2][1] as RequestInit).body)).toContain('tok2')
    // both pages' captions land in the timeline edges
    const texts = result.data.user.edge_media_to_timeline_edge.edges.map(
      (e) => e.node.edge_media_to_caption.edges[0].node.text,
    )
    expect(texts).toEqual(['cap1', 'cap2'])
  })
})

// ---------------------------------------------------------------------------
// YouTubeFetcher
// ---------------------------------------------------------------------------

describe('YouTubeFetcher', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws on construction when apiKey is empty', () => {
    expect(() => new YouTubeFetcher('')).toThrow('YOUTUBE_API_KEY is required')
  })

  // A channels.list response with one channel (no uploads playlist → recentVideos = []).
  const CHANNEL_BODY = {
    items: [
      {
        snippet: { title: 'MyChan', description: 'desc' },
        statistics: { subscriberCount: '100', videoCount: '5' },
        contentDetails: { relatedPlaylists: {} },
      },
    ],
  }

  it('includes ?key= and forHandle= in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeOkResponse(CHANNEL_BODY))
    vi.stubGlobal('fetch', fetchMock)
    await new YouTubeFetcher('yt-key').fetch('youtube', 'MyChan')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('googleapis.com/youtube/v3/channels')
    expect(url).toContain('key=yt-key')
    expect(url).toContain('forHandle=%40MyChan') // @ prefix added
  })

  it('does not double-prefix @ for a handle that already starts with @', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeOkResponse(CHANNEL_BODY))
    vi.stubGlobal('fetch', fetchMock)
    await new YouTubeFetcher('yt-key').fetch('youtube', '@MyChan')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('forHandle=%40MyChan') // only one @
  })

  it('reshapes the response into { channel, recentVideos }', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeOkResponse(CHANNEL_BODY))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new YouTubeFetcher('yt-key').fetch('youtube', 'MyChan')
    expect(result).toMatchObject({
      channel: { snippet: { title: 'MyChan' } },
      recentVideos: [],
    })
  })
})

// ---------------------------------------------------------------------------
// FakeFetcher
// ---------------------------------------------------------------------------

describe('FakeFetcher', () => {
  it('returns canned instagram payload', async () => {
    const result = await new FakeFetcher().fetch('instagram', 'any')
    expect(result).toMatchObject({ data: { user: { username: 'fake_ig_user' } } })
  })

  it('returns canned threads payload', async () => {
    const result = await new FakeFetcher().fetch('threads', 'any')
    expect(result).toMatchObject({ user: { username: 'fake_threads_user' } })
  })

  it('returns canned youtube payload', async () => {
    const result = await new FakeFetcher().fetch('youtube', 'any')
    expect(result).toMatchObject({
      channel: { snippet: { title: 'Fake YouTube Channel' } },
      recentVideos: [{ snippet: { title: 'Fake video' } }],
    })
  })

  it('throws for a platform listed in failPlatforms', async () => {
    const f = new FakeFetcher({}, ['instagram'])
    await expect(f.fetch('instagram', 'any')).rejects.toThrow('simulated failure')
  })

  it('respects overrides map', async () => {
    const f = new FakeFetcher({ instagram: { custom: true } })
    expect(await f.fetch('instagram', 'any')).toEqual({ custom: true })
  })
})

// ---------------------------------------------------------------------------
// Regression: FAKE_PAYLOADS must normalize into non-empty signals
// (guards against fetcher output drifting from the @kinnso/scan normalizer
// input shapes, which would silently yield empty signals).
// ---------------------------------------------------------------------------

describe('FAKE_PAYLOADS normalize into non-empty signals', () => {
  it('youtube', () => {
    const s = normalize('youtube', 'fake', FAKE_PAYLOADS.youtube)
    expect(s.followers).toBeGreaterThan(0)
    expect(s.recent_text.length).toBeGreaterThan(0)
  })

  it('instagram', () => {
    const s = normalize('instagram', 'fake', FAKE_PAYLOADS.instagram)
    expect(s.followers).toBeGreaterThan(0)
    expect(s.recent_text.length).toBeGreaterThan(0)
  })

  it('threads', () => {
    const s = normalize('threads', 'fake', FAKE_PAYLOADS.threads)
    expect(s.followers).toBeGreaterThan(0)
    expect(s.recent_text.length).toBeGreaterThan(0)
  })
})
