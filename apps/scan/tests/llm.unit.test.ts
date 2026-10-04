import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChatCompletionsClient, FakeLlm } from '../src/llm'
import type { LlmMessage } from '@kinnso/scan'

const MESSAGES: LlmMessage[] = [{ role: 'user', content: 'Generate DNA.' }]

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ChatCompletionsClient', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws on construction when apiKey is empty', () => {
    expect(() => new ChatCompletionsClient('', 'some-model')).toThrow('LLM API key is required')
  })

  it('defaults to the OpenRouter endpoint when no baseUrl is given', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse('hello'))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ChatCompletionsClient('or-key', 'anthropic/claude-3.5-sonnet')
    await client.complete(MESSAGES)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer or-key')
  })

  it('posts to the injected baseUrl (provider-agnostic)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse('hello'))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ChatCompletionsClient(
      'oc-key',
      'some-model',
      'https://opencode.ai/zen/v1/chat/completions'
    )
    await client.complete(MESSAGES)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://opencode.ai/zen/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer oc-key')
  })

  it('sends the model and messages in request body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ChatCompletionsClient('or-key', 'openai/gpt-4o')
    await client.complete(MESSAGES)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('openai/gpt-4o')
    expect(body.messages).toEqual(MESSAGES)
  })

  it('returns the text content from choices[0].message.content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(okResponse('the dna text')))
    const result = await new ChatCompletionsClient('key', 'model').complete(MESSAGES)
    expect(result).toBe('the dna text')
  })

  it('throws on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad', { status: 401 })))
    await expect(new ChatCompletionsClient('key', 'model').complete(MESSAGES)).rejects.toThrow(
      'LLM endpoint returned HTTP 401'
    )
  })

  it('throws when choices[0] content is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    await expect(new ChatCompletionsClient('key', 'model').complete(MESSAGES)).rejects.toThrow(
      'no text content'
    )
  })
})

describe('FakeLlm', () => {
  it('resolves with valid DNA JSON by default', async () => {
    const text = await new FakeLlm().complete(MESSAGES)
    const parsed = JSON.parse(text)
    expect(parsed.bio).toBeTruthy()
    expect(Array.isArray(parsed.niches)).toBe(true)
  })

  it('rejects when shouldFail=true', async () => {
    await expect(new FakeLlm(undefined, true).complete(MESSAGES)).rejects.toThrow(
      'simulated LLM failure'
    )
  })

  it('returns the provided custom response string', async () => {
    const custom = '{"bio":"custom","niches":[],"content_pillars":[]}'
    expect(await new FakeLlm(custom).complete(MESSAGES)).toBe(custom)
  })
})
