import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callN8n } from '@/lib/copilot/tools/n8n'

const creator = { id: 'c1', niches: ['japan'], locales: ['en'] }
const saved = { url: process.env.N8N_COPILOT_URL, token: process.env.N8N_COPILOT_TOKEN }

beforeEach(() => {
  process.env.N8N_COPILOT_URL = 'https://n8n.example/webhook/copilot'
  process.env.N8N_COPILOT_TOKEN = 'tok'
})
afterEach(() => {
  process.env.N8N_COPILOT_URL = saved.url
  process.env.N8N_COPILOT_TOKEN = saved.token
  vi.restoreAllMocks()
})

describe('callN8n', () => {
  it('returns unconfigured when env is missing', async () => {
    delete process.env.N8N_COPILOT_URL
    const r = await callN8n({ action: 'search_trends', query: 'q' }, creator)
    expect(r).toEqual({ ok: false, error: 'unconfigured' })
  })

  it('maps a successful response to { ok, data, summary }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: { spots: ['Kyoto'] }, summary: 'Found 1 spot' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
    const r = await callN8n({ action: 'search_trends', query: 'kyoto' }, creator)
    expect(r.ok).toBe(true)
    expect(r.summary).toBe('Found 1 spot')
  })

  it('posts the creator context and a bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await callN8n({ action: 'enrich', query: 'q', params: { a: 1 } }, creator)
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const init = call[1]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string).creator).toEqual(creator)
  })

  it('returns a typed error on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const r = await callN8n({ action: 'x', query: 'q' }, creator)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('500')
  })

  it('returns a typed error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const r = await callN8n({ action: 'x', query: 'q' }, creator)
    expect(r).toEqual({ ok: false, error: 'network down' })
  })
})
