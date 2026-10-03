import { describe, it, expect } from 'vitest'
import { writeRedirects } from '../src/redirect-writer'
import { parseRedirectsPhp } from '../src/redirects'
import type { SeoRedirect } from '../src/types'

/**
 * Minimal thenable fake of the supabase-js fluent client, in the same shape as
 * upserter.unit.test.ts's `Q`. Records every upsert so the test can assert the
 * conflict target and the exact rows sent.
 */
function fakeDb(error: { message: string } | null = null) {
  const calls: Array<{ table: string; rows: SeoRedirect[]; options: unknown }> = []
  const db = {
    from(table: string) {
      return {
        upsert(rows: SeoRedirect[], options: unknown) {
          calls.push({ table, rows, options })
          return Promise.resolve({ data: null, error })
        },
      }
    },
  }
  return { db: db as never, calls }
}

const row = (from_path: string, to_path = '/to', status_code = 301): SeoRedirect => ({
  from_path,
  to_path,
  status_code,
})

describe('writeRedirects', () => {
  it('upserts on from_path so a re-run converges instead of colliding', async () => {
    const { db, calls } = fakeDb()
    const rows = [row('/a', '/alpha'), row('/b', '/beta', 302)]

    const result = await writeRedirects(db, rows)

    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('seo_redirects')
    expect(calls[0].options).toEqual({ onConflict: 'from_path' })
    expect(calls[0].rows).toEqual(rows)
    expect(result).toEqual({ written: 2 })
  })

  it('throws with the table named when the write fails, like every other sync write', async () => {
    const { db } = fakeDb({ message: 'permission denied' })
    await expect(writeRedirects(db, [row('/a')])).rejects.toThrow(/redirects.*permission denied/i)
  })

  it('does not issue a write for an empty parse', async () => {
    // A redirect.php that parses to nothing is a signal worth not masking: an empty
    // upsert would report success while having written nothing.
    const { db, calls } = fakeDb()
    expect(await writeRedirects(db, [])).toEqual({ written: 0 })
    expect(calls).toHaveLength(0)
  })

  // Postgres raises "ON CONFLICT DO UPDATE command cannot affect row a second time"
  // when one statement carries two rows with the same conflict key, so a duplicated
  // from_path in redirect.php would fail the whole ingest rather than one line.
  it('collapses a duplicated from_path, keeping the first as the legacy router does', async () => {
    const { db, calls } = fakeDb()
    const result = await writeRedirects(db, [
      row('/dup', '/first'),
      row('/other', '/other-to'),
      row('/dup', '/second'),
    ])

    expect(calls[0].rows).toEqual([row('/dup', '/first'), row('/other', '/other-to')])
    expect(result).toEqual({ written: 2 })
  })

  it('writes exactly what parseRedirectsPhp produces, with no reshaping in between', async () => {
    const { db, calls } = fakeDb()
    const php = `
      Route::redirectI18n('/old-guide', '/articles/dining/new-guide', 301);
      Route::redirectI18n("/promo", "/articles/destinations/promo", 302);
      Route::redirectI18n('/no-status', '/articles/destinations/x');
    `
    const parsed = parseRedirectsPhp(php)

    await writeRedirects(db, parsed)

    expect(calls[0].rows).toEqual([
      { from_path: '/old-guide', to_path: '/articles/dining/new-guide', status_code: 301 },
      { from_path: '/promo', to_path: '/articles/destinations/promo', status_code: 302 },
      { from_path: '/no-status', to_path: '/articles/destinations/x', status_code: 301 },
    ])
  })
})
