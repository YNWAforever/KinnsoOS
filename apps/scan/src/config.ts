import { DEFAULT_LLM_URL } from './llm'

export interface ScanConfig {
  port: number
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  rapidApiKey: string
  youtubeApiKey: string
  llmApiKey: string
  llmModel: string
  llmBaseUrl: string
  /** Allowed CORS origin, or '*' for the permissive local-dev default. */
  webOrigin: string
  fixtureMode: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ScanConfig {
  const req = (k: string): string => {
    const v = env[k]
    if (!v) throw new Error(`Missing env ${k}`)
    return v
  }
  const fixtureMode = env.SCAN_FIXTURE_MODE === '1'
  const reqUnlessFixture = (k: string): string => (fixtureMode ? (env[k] ?? '') : req(k))
  return {
    port: Number(env.PORT ?? 8788),
    supabaseUrl: req('SUPABASE_URL'),
    anonKey: req('SUPABASE_ANON_KEY'),
    serviceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
    // Required in real mode, irrelevant in fixture mode. Defaulting these to ''
    // made them look optional while RapidApiFetcher, YouTubeFetcher and
    // ChatCompletionsClient each reject an empty key in their constructor — so a
    // missing key surfaced as a throw from deep inside fetchers.ts at import
    // time rather than as the same "Missing env X" every other setting gives.
    // Fixture mode swaps those clients for fakes, so it must not demand them.
    rapidApiKey: reqUnlessFixture('RAPIDAPI_KEY'),
    youtubeApiKey: reqUnlessFixture('YOUTUBE_API_KEY'),
    // Provider-agnostic LLM config. LLM_* are the canonical names; the legacy
    // OPENROUTER_* names are still honoured as a fallback so existing
    // deployments keep working. Point LLM_BASE_URL at any OpenAI-compatible
    // chat-completions endpoint (OpenRouter, OpenCode Zen, …) to switch.
    // Same rule as the fetcher keys above; OPENROUTER_API_KEY stays honoured as
    // the legacy name, so only a genuinely unset pair is an error.
    llmApiKey: fixtureMode
      ? (env.LLM_API_KEY ?? env.OPENROUTER_API_KEY ?? '')
      : (env.LLM_API_KEY ?? env.OPENROUTER_API_KEY ?? req('LLM_API_KEY')),
    llmModel: env.LLM_MODEL ?? env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
    llmBaseUrl: env.LLM_BASE_URL ?? DEFAULT_LLM_URL,
    // CORS origin for the browser-facing routes. Requests are bearer-authenticated
    // rather than cookie-authenticated, so '*' does not by itself hand an attacker
    // a session — but it removes the one cheap barrier stopping a hostile page from
    // driving a signed-in creator's token at these paid-API endpoints. So it goes
    // through the same required-env mechanism as every other setting: named
    // explicitly in production, permissive only for local dev and CI.
    // `||`, not `??`: an empty WEB_ORIGIN is a misconfiguration, not a value.
    webOrigin: env.WEB_ORIGIN || (env.NODE_ENV === 'production' ? req('WEB_ORIGIN') : '*'),
    fixtureMode,
  }
}
