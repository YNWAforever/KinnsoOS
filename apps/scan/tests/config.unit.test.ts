import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

// The minimum env a real (non-fixture) worker boots with. The platform and LLM
// keys belong here because their clients are constructed at module scope in
// server.ts and each rejects an empty key — a config that "loads" without them
// only defers the failure into fetchers.ts.
const REQUIRED = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  RAPIDAPI_KEY: 'rapid',
  YOUTUBE_API_KEY: 'youtube',
  LLM_API_KEY: 'llm',
} satisfies NodeJS.ProcessEnv

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...REQUIRED, ...extra }
}

describe('loadConfig', () => {
  it('throws when a required Supabase env is missing', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'x' })).toThrow('Missing env SUPABASE_ANON_KEY')
  })

  it('defaults the port and fixture mode', () => {
    const cfg = loadConfig(env())
    expect(cfg.port).toBe(8788)
    expect(cfg.fixtureMode).toBe(false)
  })

  // Regression: these three defaulted to '' as though optional, while
  // RapidApiFetcher, YouTubeFetcher and ChatCompletionsClient each throw on an
  // empty key when server.ts builds them at import time. The worker could never
  // boot without them, but said so from deep inside fetchers.ts instead of
  // naming the variable like every other setting.
  describe('platform and LLM keys', () => {
    it.each(['RAPIDAPI_KEY', 'YOUTUBE_API_KEY', 'LLM_API_KEY'])(
      'is required in real mode: %s',
      (key) => {
        const without = { ...env(), [key]: undefined }
        expect(() => loadConfig(without)).toThrow(`Missing env ${key}`)
      },
    )

    it('is not required in fixture mode, which swaps in fakes', () => {
      const cfg = loadConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        SCAN_FIXTURE_MODE: '1',
      })
      expect(cfg.fixtureMode).toBe(true)
      expect(cfg.rapidApiKey).toBe('')
      expect(cfg.youtubeApiKey).toBe('')
      expect(cfg.llmApiKey).toBe('')
    })

    it('still honours the legacy OPENROUTER_API_KEY name', () => {
      const cfg = loadConfig({ ...env(), LLM_API_KEY: undefined, OPENROUTER_API_KEY: 'legacy' })
      expect(cfg.llmApiKey).toBe('legacy')
    })
  })

  // Regression: the CORS origin used to be read straight off process.env in
  // server.ts with a `?? '*'` fallback, bypassing the required-env mechanism
  // entirely — so a production deploy that simply forgot WEB_ORIGIN silently
  // accepted every origin.
  describe('webOrigin', () => {
    it('defaults to * outside production so local dev needs no setup', () => {
      expect(loadConfig(env()).webOrigin).toBe('*')
      expect(loadConfig(env({ NODE_ENV: 'development' })).webOrigin).toBe('*')
      expect(loadConfig(env({ NODE_ENV: 'test' })).webOrigin).toBe('*')
    })

    it('is required in production', () => {
      expect(() => loadConfig(env({ NODE_ENV: 'production' }))).toThrow('Missing env WEB_ORIGIN')
    })

    it('uses WEB_ORIGIN when set, in every environment', () => {
      const origin = 'https://remix-kinnso-web.vercel.app'
      expect(loadConfig(env({ WEB_ORIGIN: origin })).webOrigin).toBe(origin)
      expect(loadConfig(env({ NODE_ENV: 'production', WEB_ORIGIN: origin })).webOrigin).toBe(origin)
    })

    it('rejects an empty WEB_ORIGIN in production rather than falling back to *', () => {
      expect(() => loadConfig(env({ NODE_ENV: 'production', WEB_ORIGIN: '' }))).toThrow(
        'Missing env WEB_ORIGIN',
      )
    })
  })
})
