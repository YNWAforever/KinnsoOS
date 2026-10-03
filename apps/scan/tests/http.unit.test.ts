import { describe, expect, it, vi } from 'vitest'
import {
  discardBody,
  readCappedJson,
  readCappedText,
  ResponseTooLargeError,
} from '../src/http'

/** A response whose body streams `chunks` with no content-length header. */
function streamed(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

// ---------------------------------------------------------------------------
// Regression: fetchers.ts and llm.ts buffered whole third-party responses via
// res.json()/res.text(), so one misbehaving upstream could OOM the single
// worker process and kill every in-flight job with it.
// ---------------------------------------------------------------------------

describe('readCappedJson', () => {
  it('parses a body under the cap', async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 200 })
    expect(await readCappedJson<{ ok: boolean }>(res, 1024)).toEqual({ ok: true })
  })

  it('rejects a body that exceeds the cap mid-stream', async () => {
    const res = streamed(['x'.repeat(100), 'y'.repeat(100)])
    await expect(readCappedJson(res, 150)).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it('rejects early on a declared content-length over the cap', async () => {
    const res = new Response('x'.repeat(500), {
      status: 200,
      headers: { 'content-length': '500' },
    })
    await expect(readCappedJson(res, 100)).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it('cancels the body it refuses so the socket is not held open', async () => {
    const res = new Response('x'.repeat(500), {
      status: 200,
      headers: { 'content-length': '500' },
    })
    await readCappedJson(res, 100).catch(() => {})
    // A cancelled stream is no longer readable; a merely-abandoned one would be.
    expect(res.bodyUsed || res.body?.locked || res.body === null).toBeTruthy()
  })

  it('falls back to res.json() for a response with no readable stream', async () => {
    const fake = { ok: true, status: 200, json: async () => ({ items: [1] }) } as unknown as Response
    expect(await readCappedJson<{ items: number[] }>(fake, 10)).toEqual({ items: [1] })
  })
})

describe('readCappedText', () => {
  it('returns text under the cap', async () => {
    expect(await readCappedText(new Response('hello', { status: 200 }), 1024)).toBe('hello')
  })

  it('rejects text over the cap', async () => {
    await expect(readCappedText(streamed(['a'.repeat(200)]), 100)).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    )
  })
})

describe('discardBody', () => {
  it('cancels a real body', async () => {
    const res = new Response('payload', { status: 200 })
    await discardBody(res)
    expect(res.bodyUsed || res.body?.locked || res.body === null).toBeTruthy()
  })

  it('is a no-op for a body-less response', async () => {
    await expect(discardBody({ body: null })).resolves.toBeUndefined()
  })

  it('swallows a cancel that throws', async () => {
    const res = { body: { cancel: () => Promise.reject(new Error('already locked')) } }
    await expect(discardBody(res as unknown as Response)).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Timeouts — regression: neither fetchers.ts nor llm.ts passed a signal, so a
// stalled upstream hung an in-process job for undici's multi-minute default,
// multiplied by up to four retry attempts.
// ---------------------------------------------------------------------------

describe('per-attempt timeouts', () => {
  it('is wired into every RapidAPI and YouTube call', async () => {
    const { RapidApiFetcher, YouTubeFetcher } = await import('../src/fetchers')
    // A fresh Response per call — a Response body can only be consumed once.
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ items: [{ id: 'UCx', contentDetails: {} }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await new RapidApiFetcher('key').fetch('threads', 'handle')
    await new YouTubeFetcher('key').fetch('youtube', 'handle')

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
    vi.unstubAllGlobals()
  })

  it('is wired into the LLM call', async () => {
    const { ChatCompletionsClient } = await import('../src/llm')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await new ChatCompletionsClient('key', 'model').complete([{ role: 'user', content: 'hi' }])

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    vi.unstubAllGlobals()
  })

  it('treats an aborted attempt as retryable and reports a sanitised reason', async () => {
    const { YouTubeFetcher } = await import('../src/fetchers')
    const abort = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    })
    const fetchMock = vi.fn().mockRejectedValue(abort)
    vi.stubGlobal('fetch', fetchMock)

    // resolveChannelId swallows failures, so drive the throwing path instead.
    const err = await new YouTubeFetcher('super-secret-key')
      .fetch('youtube', 'handle')
      .catch((e: Error) => e)

    // Retried, not crashed on the first abort.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect((err as Error).message).toMatch(/timed out after \d+ms/)
    // The YouTube API key travels as a query param — it must not reach the message.
    expect((err as Error).message).not.toContain('super-secret-key')
    expect((err as Error).message).not.toContain('?')
    vi.unstubAllGlobals()
  }, 15_000)

  it('surfaces an LLM timeout as a plain retryable error', async () => {
    const { ChatCompletionsClient } = await import('../src/llm')
    const abort = Object.assign(new Error('aborted'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))

    await expect(
      new ChatCompletionsClient('key', 'model').complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/LLM request timed out after \d+ms/)
    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// Abandoned bodies — regression: retryable (429/5xx) responses and the early
// !res.ok returns dropped their bodies without cancelling, holding sockets out
// of the undici pool until the peer closed them.
// ---------------------------------------------------------------------------

describe('abandoned response bodies', () => {
  it('cancels the body of a retried 429 before sleeping', async () => {
    const { RapidApiFetcher } = await import('../src/fetchers')
    const throttled = new Response('slow down', { status: 429 })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled)
      .mockResolvedValue(new Response(JSON.stringify({ user: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await new RapidApiFetcher('key').fetch('threads', 'handle')

    expect(throttled.bodyUsed || throttled.body?.locked || throttled.body === null).toBeTruthy()
    vi.unstubAllGlobals()
  }, 10_000)

  it('cancels the body of a non-retryable error response', async () => {
    const { RapidApiFetcher } = await import('../src/fetchers')
    const notFound = new Response('no such user', { status: 404 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound))

    await new RapidApiFetcher('key').fetch('threads', 'handle').catch(() => {})

    expect(notFound.bodyUsed || notFound.body?.locked || notFound.body === null).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('cancels the body of a failed single-post fetch', async () => {
    const { RapidApiFetcher } = await import('../src/fetchers')
    const notFound = new Response('gone', { status: 404 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound))

    expect(await new RapidApiFetcher('key').fetchPost('instagram', 'Cabc')).toBeNull()
    expect(notFound.bodyUsed || notFound.body?.locked || notFound.body === null).toBeTruthy()
    vi.unstubAllGlobals()
  })
})
