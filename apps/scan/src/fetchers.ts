import type { PlatformFetcher, Platform } from '@kinnso/scan'
import {
  discardBody,
  readCappedJson,
  MAX_RAPIDAPI_BODY_BYTES,
  MAX_YOUTUBE_BODY_BYTES,
  RAPIDAPI_TIMEOUT_MS,
  YOUTUBE_TIMEOUT_MS,
} from './http'

// ---------------------------------------------------------------------------
// Single-post fetch types (for mission verification)
// ---------------------------------------------------------------------------

export type SinglePostResult = {
  authorHandle: string | null
  authorId?: string | null
  engagementCount: number | null
  postUrl: string | null
}

export interface PostFetcher {
  // Returns null on any fetch/parse failure — callers treat null as 'unavailable'.
  fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null>
  // Resolve a creator's registered handle to a canonical channel id. YouTube-only;
  // non-YouTube fetchers return null. Used for the ID-first match.
  resolveChannelId(handle: string): Promise<string | null>
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 500

async function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Strips the query string from a URL so secrets carried as query params (e.g. the
 * YouTube Data API `key=`) never reach an Error message or log line. Falls back to
 * a static placeholder if the URL cannot be parsed.
 */
function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return '<unparseable-url>'
  }
}

/** A timed-out attempt surfaces as a DOMException, not an Error subclass. */
function isTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/**
 * Builds the message thrown once every attempt has been spent.
 *
 * The raw value can be an undici network error, a DOMException from the
 * per-attempt timeout, or a synthesised HTTP-status error, and it ends up in
 * logs (and, via the pipeline, in a client-readable `job.error`). So it is
 * normalised to one redacted, single-line, length-capped string.
 */
function fetchFailureMessage(url: string, err: unknown, timeoutMs: number): string {
  const target = redactUrl(url)
  if (isTimeout(err)) return `request to ${target} timed out after ${timeoutMs}ms`
  const detail = err instanceof Error ? err.message : String(err ?? '')
  if (!detail) return `request to ${target} failed`
  return `request to ${target} failed: ${detail.replace(/\s+/g, ' ').slice(0, 200)}`
}

/**
 * `fetch` plus bounded retries and a per-ATTEMPT wall-clock budget.
 *
 * The timeout is applied per attempt rather than across the whole call so a
 * retry always gets a full budget; the caller-visible ceiling is therefore
 * `timeoutMs × (maxRetries + 1)` plus backoff. Without it a stalled upstream
 * inherits undici's multi-minute defaults and pins an in-process job — and its
 * memory — for as long as the peer keeps the socket open.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; maxRetries?: number }
): Promise<Response> {
  const { timeoutMs, maxRetries = MAX_RETRIES } = opts
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleepMs(INITIAL_DELAY_MS * 2 ** (attempt - 1))
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (err) {
      // Includes the timeout abort: a slow upstream is a transient failure, so
      // it feeds the retry loop exactly like a dropped connection would.
      lastError = err
      continue
    }
    if (!RETRYABLE_STATUSES.has(res.status)) return res
    // Nothing will read this body, so hand its socket back before sleeping.
    await discardBody(res)
    lastError = new Error(`HTTP ${res.status}`)
  }
  throw new Error(fetchFailureMessage(url, lastError, timeoutMs))
}

// ---------------------------------------------------------------------------
// RapidAPI fetcher — Instagram + Threads
// ---------------------------------------------------------------------------

const RAPIDAPI_IG_HOST = 'instagram-scraper-stable-api.p.rapidapi.com'
const RAPIDAPI_THREADS_HOST = 'threads-scraper-api2.p.rapidapi.com'

// How many pages (12 posts each) of recent Instagram posts to pull for caption
// signal. The feed includes reels/videos with captions, so this also covers reel
// content; the dedicated reels endpoint returns engagement metrics but no captions.
// Tunable — higher = richer DNA but a bigger/slower LLM prompt and more API calls.
const IG_POST_PAGES = 2

/**
 * Fetches public profile data for Instagram or Threads via RapidAPI.
 * Returns the raw JSON body; shape is passed to @kinnso/scan `normalize()` as-is.
 */
export class RapidApiFetcher implements PlatformFetcher {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('RapidApiFetcher: RAPIDAPI_KEY is required')
  }

  async fetch(platform: 'instagram' | 'threads', handle: string): Promise<unknown> {
    const host =
      platform === 'instagram' ? RAPIDAPI_IG_HOST : RAPIDAPI_THREADS_HOST

    // The instagram-scraper-stable-api product serves profile data via a POST
    // form endpoint (`/ig_get_fb_profile_v3.php`, body `username_or_url=<handle>`)
    // that returns a FLAT object: { username, biography, follower_count, ... }.
    // The earlier `/user/info?username=` REST route does not exist on this API
    // and 4xx'd for every handle. Threads keeps its own endpoint shape.
    const res =
      platform === 'instagram'
        ? await fetchWithRetry(`https://${host}/ig_get_fb_profile_v3.php`, {
            method: 'POST',
            headers: {
              'x-rapidapi-key': this.apiKey,
              'x-rapidapi-host': host,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ username_or_url: handle }).toString(),
          }, { timeoutMs: RAPIDAPI_TIMEOUT_MS })
        : await fetchWithRetry(`https://${host}/user/info?username=${encodeURIComponent(handle)}`, {
            method: 'GET',
            headers: {
              'x-rapidapi-key': this.apiKey,
              'x-rapidapi-host': host,
              Accept: 'application/json',
            },
          }, { timeoutMs: RAPIDAPI_TIMEOUT_MS })

    if (!res.ok) {
      await discardBody(res)
      throw new Error(`RapidAPI ${platform} returned HTTP ${res.status} for handle "${handle}"`)
    }
    const raw = await readCappedJson<Record<string, unknown>>(res, MAX_RAPIDAPI_BODY_BYTES)

    // Instagram: the profile endpoint carries no captions, so enrich it with
    // recent post captions from `/get_ig_user_posts.php` (POST form; captions live
    // at `posts[].node.caption.text`) so the DNA reflects real content, not just
    // the bio. Best-effort — a posts-fetch failure still yields a profile-only
    // ("thin") result. The reshape below reads these off `raw.posts`.
    if (platform === 'instagram') {
      try {
        const captions: string[] = []
        const seen = new Set<string>()
        let token = ''
        for (let page = 0; page < IG_POST_PAGES; page++) {
          const postsRes = await fetchWithRetry(`https://${host}/get_ig_user_posts.php`, {
            method: 'POST',
            headers: {
              'x-rapidapi-key': this.apiKey,
              'x-rapidapi-host': host,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              username_or_url: handle,
              amount: '12',
              pagination_token: token,
            }).toString(),
          }, { timeoutMs: RAPIDAPI_TIMEOUT_MS })
          if (!postsRes.ok) {
            await discardBody(postsRes)
            break
          }
          const pj = await readCappedJson<{
            posts?: Array<{ node?: { caption?: { text?: string } } }>
            pagination_token?: string
          }>(postsRes, MAX_RAPIDAPI_BODY_BYTES)
          for (const p of pj.posts ?? []) {
            const t = p?.node?.caption?.text
            if (typeof t === 'string' && t.trim().length > 0 && !seen.has(t)) {
              seen.add(t)
              captions.push(t)
            }
          }
          // Follow the cursor to the next page; stop when the API stops returning one.
          token = pj.pagination_token ?? ''
          if (!token) break
        }
        if (captions.length > 0) raw.posts = captions.map((caption) => ({ caption }))
      } catch (err) {
        console.warn(`[scan] instagram posts fetch failed for "${handle}"`, (err as Error).message)
      }
    }

    // Reshape the provider response into the nested shape the @kinnso/scan
    // normalizers read:
    //   - Instagram: { data: { user: { edge_followed_by, biography,
    //       edge_media_to_timeline_edge: { edges[].node.edge_media_to_caption.edges[].node.text } } } }
    //   - Threads:   { user: { follower_count, biography }, threads[].post.caption.text }
    //
    // IMPORTANT: the exact SOURCE field paths below (`raw.*`) are provider-dependent
    // and NOT yet verified — they must be confirmed against the live RapidAPI
    // response during the Task 9 smoke-test and the mappings adjusted so the
    // OUTPUT still matches the normalizer input shapes above. If they do not
    // match, normalization silently yields empty signals.
    if (platform === 'instagram') {
      const src = (raw.data ?? raw.user ?? raw) as Record<string, any>
      const u = (src.user ?? src) as Record<string, any>
      return {
        data: {
          user: {
            username: u.username,
            biography: u.biography ?? u.bio,
            edge_followed_by:
              u.edge_followed_by ??
              { count: u.followers_count ?? u.follower_count ?? 0 },
            edge_media_to_timeline_edge:
              u.edge_media_to_timeline_edge ??
              {
                edges: ((u.posts ?? u.media ?? []) as any[]).map((p: any) => ({
                  node: {
                    edge_media_to_caption: {
                      edges: [{ node: { text: p?.caption ?? p?.text ?? '' } }],
                    },
                  },
                })),
              },
          },
        },
      }
    }

    // threads
    const src = (raw.user ?? raw.data ?? raw) as Record<string, any>
    const u = (src.user ?? src) as Record<string, any>
    const rawThreads = (raw.threads ?? src.threads ?? u.threads ?? []) as any[]
    return {
      user: {
        username: u.username,
        biography: u.biography ?? u.bio,
        follower_count: u.follower_count ?? u.followers_count ?? 0,
      },
      threads: rawThreads.map((t: any) => ({
        post: { caption: { text: t?.post?.caption?.text ?? t?.caption ?? t?.text ?? '' } },
      })),
    }
  }

  async fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null> {
    if (platform === 'youtube') return null // routed to YouTubeFetcher by CompositeFetcher
    try {
      if (platform === 'instagram') {
        const res = await fetchWithRetry(`https://${RAPIDAPI_IG_HOST}/get_media_data.php`, {
          method: 'POST',
          headers: {
            'x-rapidapi-key': this.apiKey,
            'x-rapidapi-host': RAPIDAPI_IG_HOST,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ shortcode: id }).toString(),
        }, { timeoutMs: RAPIDAPI_TIMEOUT_MS })
        if (!res.ok) {
          await discardBody(res)
          return null
        }
        const raw = await readCappedJson<Record<string, any>>(res, MAX_RAPIDAPI_BODY_BYTES)
        const node = (raw.data ?? raw.media ?? raw) as Record<string, any>
        const author =
          node?.owner?.username ?? node?.user?.username ?? node?.author?.username ?? null
        const likes = Number(node?.edge_media_preview_like?.count ?? node?.like_count ?? node?.likes ?? NaN)
        return {
          authorHandle: typeof author === 'string' ? author : null,
          engagementCount: Number.isFinite(likes) ? likes : null,
          postUrl: `https://www.instagram.com/p/${id}/`,
        }
      }

      // Threads: best-effort post info on the existing Threads host.
      const res = await fetchWithRetry(`https://${RAPIDAPI_THREADS_HOST}/post/info?post_id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': RAPIDAPI_THREADS_HOST,
          Accept: 'application/json',
        },
      }, { timeoutMs: RAPIDAPI_TIMEOUT_MS })
      if (!res.ok) {
        await discardBody(res)
        return null
      }
      const raw = await readCappedJson<Record<string, any>>(res, MAX_RAPIDAPI_BODY_BYTES)
      const node = (raw.data ?? raw.post ?? raw) as Record<string, any>
      const author = node?.user?.username ?? node?.author?.username ?? node?.owner?.username ?? null
      const likes = Number(node?.like_count ?? node?.likes ?? NaN)
      return {
        authorHandle: typeof author === 'string' ? author : null,
        engagementCount: Number.isFinite(likes) ? likes : null,
        postUrl: null,
      }
    } catch (err) {
      console.warn(`[scan] fetchPost failed: ${platform}/${id}`, (err as Error).message)
      return null
    }
  }

  // RapidAPI handles IG/Threads only; channel-id resolution is YouTube-specific.
  async resolveChannelId(): Promise<string | null> {
    return null
  }
}

// ---------------------------------------------------------------------------
// YouTube Data API v3 fetcher
// ---------------------------------------------------------------------------

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'

/**
 * Fetches public channel data for a YouTube handle/channel via the Data API v3.
 * The `handle` can be a @handle, channel ID (UC...), or custom URL slug.
 */
export class YouTubeFetcher implements PlatformFetcher {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('YouTubeFetcher: YOUTUBE_API_KEY is required')
  }

  // Single-video author lookup for mission proof verification. Best-effort:
  // any failure resolves to null (treated as confidence 'unavailable').
  async fetchVideoAuthor(id: string): Promise<SinglePostResult | null> {
    try {
      const vurl =
        `${YOUTUBE_BASE}/videos?part=snippet,statistics` +
        `&id=${encodeURIComponent(id)}&key=${encodeURIComponent(this.apiKey)}`
      const vres = await fetchWithRetry(
        vurl,
        { method: 'GET', headers: { Accept: 'application/json' } },
        { timeoutMs: YOUTUBE_TIMEOUT_MS },
      )
      if (!vres.ok) {
        await discardBody(vres)
        return null
      }
      const vbody = await readCappedJson<{
        items?: Array<{ snippet?: { channelId?: string }; statistics?: { likeCount?: string; viewCount?: string } }>
      }>(vres, MAX_YOUTUBE_BODY_BYTES)
      const item = vbody.items?.[0]
      const channelId = item?.snippet?.channelId ?? null
      if (!channelId) return null
      const likes = Number(item?.statistics?.likeCount ?? NaN)
      const views = Number(item?.statistics?.viewCount ?? NaN)
      const engagementCount = Number.isFinite(likes) ? likes : Number.isFinite(views) ? views : null

      // Best-effort customUrl (@handle) for the handle-fallback match.
      let authorHandle: string | null = null
      try {
        const curl =
          `${YOUTUBE_BASE}/channels?part=snippet` +
          `&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(this.apiKey)}`
        const cres = await fetchWithRetry(
          curl,
          { method: 'GET', headers: { Accept: 'application/json' } },
          { timeoutMs: YOUTUBE_TIMEOUT_MS },
        )
        if (cres.ok) {
          const cbody = await readCappedJson<{ items?: Array<{ snippet?: { customUrl?: string } }> }>(
            cres,
            MAX_YOUTUBE_BODY_BYTES,
          )
          authorHandle = cbody.items?.[0]?.snippet?.customUrl ?? null
        } else {
          await discardBody(cres)
        }
      } catch (err) {
        console.warn(`[scan] youtube customUrl fetch failed for "${channelId}"`, (err as Error).message)
      }

      return { authorHandle, authorId: channelId, engagementCount, postUrl: `https://www.youtube.com/watch?v=${id}` }
    } catch (err) {
      console.warn(`[scan] youtube fetchVideoAuthor failed for "${id}"`, (err as Error).message)
      return null
    }
  }

  // Resolve a creator's registered @handle to its canonical channel id (UC…).
  // Best-effort: returns null on any failure.
  async resolveChannelId(handle: string): Promise<string | null> {
    try {
      const forHandle = handle.startsWith('@') ? handle : `@${handle}`
      const url =
        `${YOUTUBE_BASE}/channels?part=id` +
        `&forHandle=${encodeURIComponent(forHandle)}&key=${encodeURIComponent(this.apiKey)}`
      const res = await fetchWithRetry(
        url,
        { method: 'GET', headers: { Accept: 'application/json' } },
        { timeoutMs: YOUTUBE_TIMEOUT_MS },
      )
      if (!res.ok) {
        await discardBody(res)
        return null
      }
      const body = await readCappedJson<{ items?: Array<{ id?: string }> }>(res, MAX_YOUTUBE_BODY_BYTES)
      return body.items?.[0]?.id ?? null
    } catch (err) {
      console.warn(`[scan] youtube resolveChannelId failed for "${handle}"`, (err as Error).message)
      return null
    }
  }

  async fetch(platform: 'youtube', handle: string): Promise<unknown> {
    // Normalise: strip leading "@" if present
    const forHandle = handle.startsWith('@') ? handle : `@${handle}`
    // Request contentDetails too so we can locate the uploads playlist.
    const url =
      `${YOUTUBE_BASE}/channels` +
      `?part=snippet,statistics,contentDetails` +
      `&forHandle=${encodeURIComponent(forHandle)}` +
      `&key=${encodeURIComponent(this.apiKey)}`

    const res = await fetchWithRetry(
      url,
      { method: 'GET', headers: { Accept: 'application/json' } },
      { timeoutMs: YOUTUBE_TIMEOUT_MS },
    )

    if (!res.ok) {
      await discardBody(res)
      throw new Error(`YouTube Data API returned HTTP ${res.status} for handle "${handle}"`)
    }
    const body = await readCappedJson<{
      items?: Array<{
        contentDetails?: { relatedPlaylists?: { uploads?: string } }
      }>
    }>(res, MAX_YOUTUBE_BODY_BYTES)
    const channel = body.items?.[0]
    if (!channel) {
      throw new Error(`YouTube Data API returned no channel for handle "${handle}"`)
    }

    // Fetch recent uploads. Graceful degradation: a videos-call failure still
    // returns the channel with an empty recentVideos list (per the per-platform
    // partial-failure design).
    let recentVideos: unknown[] = []
    try {
      const uploads = channel.contentDetails?.relatedPlaylists?.uploads
      if (uploads) {
        const vurl =
          `${YOUTUBE_BASE}/playlistItems` +
          `?part=snippet` +
          `&playlistId=${encodeURIComponent(uploads)}` +
          `&maxResults=10` +
          `&key=${encodeURIComponent(this.apiKey)}`
        const vres = await fetchWithRetry(
          vurl,
          { method: 'GET', headers: { Accept: 'application/json' } },
          { timeoutMs: YOUTUBE_TIMEOUT_MS },
        )
        if (vres.ok) {
          const vbody = await readCappedJson<{ items?: Array<{ snippet?: unknown }> }>(
            vres,
            MAX_YOUTUBE_BODY_BYTES,
          )
          recentVideos = (vbody.items ?? []).map((it) => ({ snippet: it.snippet }))
        } else {
          await discardBody(vres)
        }
      }
    } catch (err) {
      console.warn(`[scan] YouTube recentVideos fetch failed for "${handle}"`, (err as Error).message)
    }

    // Reshape into the `{ channel, recentVideos }` shape the @kinnso/scan
    // YouTube normalizer reads.
    return { channel, recentVideos }
  }
}

// ---------------------------------------------------------------------------
// Composite fetcher — dispatches to the right real fetcher per platform
// ---------------------------------------------------------------------------

/**
 * The default real fetcher used by apps/scan in production.
 * Dispatches IG/Threads to RapidApiFetcher and YouTube to YouTubeFetcher.
 */
export class CompositeFetcher implements PlatformFetcher {
  private readonly rapidApi: RapidApiFetcher
  private readonly youtube: YouTubeFetcher

  constructor(rapidApiKey: string, youtubeApiKey: string) {
    this.rapidApi = new RapidApiFetcher(rapidApiKey)
    this.youtube = new YouTubeFetcher(youtubeApiKey)
  }

  fetch(platform: Platform, handle: string): Promise<unknown> {
    if (platform === 'instagram' || platform === 'threads') {
      return this.rapidApi.fetch(platform as 'instagram' | 'threads', handle)
    }
    if (platform === 'youtube') {
      return this.youtube.fetch('youtube', handle)
    }
    throw new Error(`CompositeFetcher: unsupported platform "${platform}"`)
  }

  fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null> {
    if (platform === 'youtube') return this.youtube.fetchVideoAuthor(id)
    return this.rapidApi.fetchPost(platform, id)
  }

  resolveChannelId(handle: string): Promise<string | null> {
    return this.youtube.resolveChannelId(handle)
  }
}

// ---------------------------------------------------------------------------
// FakeFetcher — used in integration tests and SCAN_FIXTURE_MODE
// ---------------------------------------------------------------------------

/**
 * Minimal canned raw payload returned for each platform by the fake fetcher.
 * NOTE: These shapes MUST match the nested paths the `@kinnso/scan` normalizers
 * read (Plan 2 is the contract) — otherwise `normalize()` silently yields empty
 * signals. See the regression test in fetchers.unit.test.ts.
 */
export const FAKE_PAYLOADS: Record<Platform, unknown> = {
  instagram: {
    data: {
      user: {
        username: 'fake_ig_user',
        biography: 'Fake IG bio for testing',
        edge_followed_by: { count: 5000 },
        edge_media_to_timeline_edge: {
          edges: [
            {
              node: {
                edge_media_to_caption: {
                  edges: [{ node: { text: 'Fake IG post caption' } }],
                },
              },
            },
          ],
        },
      },
    },
  },
  threads: {
    user: {
      username: 'fake_threads_user',
      biography: 'Fake Threads bio for testing',
      follower_count: 1200,
    },
    threads: [{ post: { caption: { text: 'Fake threads post' } } }],
  },
  youtube: {
    channel: {
      snippet: { title: 'Fake YouTube Channel', description: 'Fake YT description' },
      statistics: { subscriberCount: '8000', videoCount: '30' },
    },
    recentVideos: [
      { snippet: { title: 'Fake video', description: 'Fake video description' } },
    ],
  },
}

const FAKE_POSTS: Record<'instagram' | 'threads' | 'youtube', (id: string) => SinglePostResult> = {
  instagram: (id) => ({ authorHandle: 'fake_ig_user', engagementCount: 1234, postUrl: `https://www.instagram.com/p/${id}/` }),
  threads: (id) => ({ authorHandle: 'fake_threads_user', engagementCount: 56, postUrl: `https://www.threads.net/post/${id}` }),
  youtube: (id) => ({ authorHandle: 'fakeytchannel', authorId: 'UCfakechannelid', engagementCount: 999, postUrl: `https://www.youtube.com/watch?v=${id}` }),
}

/**
 * Fake fetcher for tests and fixture mode.
 * Never makes network calls; returns deterministic canned payloads.
 * Optionally override per platform via `overrides` map.
 * Third arg `postOverrides` overrides per-platform single-post fetch results.
 */
export class FakeFetcher implements PlatformFetcher, PostFetcher {
  constructor(
    private readonly overrides: Partial<Record<Platform, unknown>> = {},
    private readonly failPlatforms: Platform[] = [],
    private readonly postOverrides: Partial<Record<'instagram' | 'threads' | 'youtube', SinglePostResult>> = {},
    private readonly channelId: string | null = 'UCfakechannelid',
  ) {}

  async fetch(platform: Platform, _handle: string): Promise<unknown> {
    if (this.failPlatforms.includes(platform)) {
      throw new Error(`FakeFetcher: simulated failure for platform "${platform}"`)
    }
    return this.overrides[platform] ?? FAKE_PAYLOADS[platform]
  }

  async fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null> {
    if (this.failPlatforms.includes(platform)) return null
    if (this.postOverrides[platform]) return this.postOverrides[platform]!
    return FAKE_POSTS[platform](id)
  }

  async resolveChannelId(_handle: string): Promise<string | null> {
    return this.channelId
  }
}
