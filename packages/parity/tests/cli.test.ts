import { describe, it, expect, vi } from 'vitest'
import { parseArgs, run } from '../src/cli'

describe('parseArgs', () => {
  it('reads flags and trims a trailing slash off base-url', () => {
    const cfg = parseArgs(
      ['--base-url', 'https://live.test/', '--supabase-url', 'https://db.test', '--supabase-anon-key', 'anon', '--sample', '5', '--json', '--fail-fast'],
      {},
    )
    expect(cfg).toMatchObject({
      baseUrl: 'https://live.test',
      supabaseUrl: 'https://db.test',
      supabaseAnonKey: 'anon',
      sample: 5,
      json: true,
      failFast: true,
    })
  })

  it('falls back to env vars and defaults', () => {
    const cfg = parseArgs([], {
      NEXT_PUBLIC_SUPABASE_URL: 'https://env-db.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'env-anon',
    })
    expect(cfg.baseUrl).toBe('https://remix-kinnso-web.vercel.app')
    expect(cfg.supabaseUrl).toBe('https://env-db.test')
    expect(cfg.supabaseAnonKey).toBe('env-anon')
    expect(cfg.sample).toBe(3)
    expect(cfg.json).toBe(false)
  })

  it('captures legacy-mode flags', () => {
    const cfg = parseArgs(['--legacy-sitemap', 'https://legacy.test/sitemap.xml'], {})
    expect(cfg.legacySitemap).toBe('https://legacy.test/sitemap.xml')
  })
})

describe('run exit codes', () => {
  it('exits 2 (misconfiguration) when Supabase credentials are missing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await run(parseArgs([], {}))).toBe(2)
    err.mockRestore()
  })

  it('exits 2 — not 0 — when the baseline cannot be built (--legacy-mysql)', async () => {
    // The gate never ran, so this is a misconfiguration, not a parity failure. Exiting 0
    // here was the whole defect: an unmeasurable baseline certified an unverified cutover.
    // --legacy-mysql is implemented now, so the refusal is no longer a hard-coded message;
    // the property it protected is asserted directly instead, with a DSN that fails fast.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await run(parseArgs(
      ['--supabase-url', 'https://db.test', '--supabase-anon-key', 'anon', '--legacy-mysql', 'not-a-dsn'],
      {},
    ))

    expect(code).toBe(2)
    expect(code).not.toBe(0)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
