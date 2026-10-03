import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createApp, type AppDeps, type SyncService } from '../src/app'
import type { SeoRedirect } from '@kinnso/sync'

const SECRET = 'foso-webhook-secret'
const ADMIN = 'admin-token'

/**
 * Stub Sync. `makeSync()` opens a MySQL pool and a Supabase client in its constructor,
 * so the real one can never appear in a unit test; `createApp` takes the service as a
 * dependency precisely so this stub can stand in.
 */
function makeDeps(overrides: Partial<AppDeps> = {}) {
  const calls: { syncOne: Array<[number, { deleteIntent?: boolean } | undefined]>; backfill: number } = {
    syncOne: [],
    backfill: 0,
  }
  // `makeSync()` also returns a `syncDelete` (an unconditional soft-delete, kept for
  // admin use). The stub carries one so a handler that reached for it would be caught
  // instead of quietly passing — see the "deleted event" tests.
  const syncDelete = vi.fn()
  const sync: SyncService & { syncDelete: typeof syncDelete } = {
    async syncOne(id, opts) {
      calls.syncOne.push([id, opts])
      return { ok: true, skipped: false }
    },
    async backfill() {
      calls.backfill++
      return { total: 1, skipped: 0, warnings: 0 }
    },
    syncDelete,
  }
  const writes: SeoRedirect[][] = []
  const deps: AppDeps = {
    sync,
    webhookSecret: SECRET,
    adminToken: ADMIN,
    revalidate: async () => {},
    writeRedirects: async (rows) => {
      writes.push(rows)
      return { written: rows.length }
    },
    ...overrides,
  }
  return { app: createApp(deps), calls, syncDelete, writes }
}

const signed = (body: unknown, secret = SECRET) => {
  const raw = JSON.stringify(body)
  return {
    method: 'POST',
    body: raw,
    headers: { 'x-foso-signature': createHmac('sha256', secret).update(raw).digest('hex') },
  }
}

describe('admin auth', () => {
  it.each([
    ['a missing header', undefined],
    ['a wrong token', 'not-the-token'],
    ['an empty token', ''],
    // A prefix of the real token must not pass — the compare is whole-value, not startsWith.
    ['a prefix of the real token', ADMIN.slice(0, 5)],
  ])('rejects /sync/:id with %s', async (_label, token) => {
    const { app, calls } = makeDeps()
    const res = await app.request('/sync/42', {
      method: 'POST',
      headers: token === undefined ? {} : { 'x-admin-token': token },
    })
    expect(res.status).toBe(401)
    expect(calls.syncOne).toHaveLength(0)
  })

  it('rejects /backfill without a valid token and never starts the backfill', async () => {
    const { app, calls } = makeDeps()
    const res = await app.request('/backfill', { method: 'POST', headers: { 'x-admin-token': 'nope' } })
    expect(res.status).toBe(401)
    expect(calls.backfill).toBe(0)
  })

  it('rejects every admin request when SYNC_ADMIN_TOKEN is unset, even a matching empty header', async () => {
    // Fail closed: an unconfigured token must not authorize a caller who also sends nothing.
    const { app, calls } = makeDeps({ adminToken: '' })
    expect((await app.request('/backfill', { method: 'POST' })).status).toBe(401)
    expect((await app.request('/backfill', { method: 'POST', headers: { 'x-admin-token': '' } })).status).toBe(401)
    expect(calls.backfill).toBe(0)
  })

  it('accepts the correct token', async () => {
    const { app, calls } = makeDeps()
    const sync = await app.request('/sync/42', { method: 'POST', headers: { 'x-admin-token': ADMIN } })
    expect(sync.status).toBe(200)
    expect(calls.syncOne).toEqual([[42, undefined]])

    const backfill = await app.request('/backfill', { method: 'POST', headers: { 'x-admin-token': ADMIN } })
    expect(backfill.status).toBe(200)
    expect(await backfill.json()).toEqual({ total: 1, skipped: 0, warnings: 0 })
  })
})

describe('webhook HMAC', () => {
  it('accepts a correctly signed payload and syncs the post', async () => {
    const { app, calls } = makeDeps()
    const res = await app.request('/webhook/foso', signed({ legacy_post_id: 7, event: 'updated' }))
    expect(res.status).toBe(200)
    expect(calls.syncOne).toEqual([[7, { deleteIntent: false }]])
  })

  it('rejects a signature made with the wrong secret', async () => {
    const { app, calls } = makeDeps()
    const res = await app.request('/webhook/foso', signed({ legacy_post_id: 7 }, 'wrong-secret'))
    expect(res.status).toBe(401)
    expect(calls.syncOne).toHaveLength(0)
  })

  it('rejects a signature that is valid for a DIFFERENT body (tampered payload)', async () => {
    const { app, calls } = makeDeps()
    const req = signed({ legacy_post_id: 7 })
    const res = await app.request('/webhook/foso', { ...req, body: JSON.stringify({ legacy_post_id: 8 }) })
    expect(res.status).toBe(401)
    expect(calls.syncOne).toHaveLength(0)
  })

  it('rejects a missing signature header', async () => {
    const { app } = makeDeps()
    const res = await app.request('/webhook/foso', { method: 'POST', body: JSON.stringify({ legacy_post_id: 7 }) })
    expect(res.status).toBe(401)
  })

  it('rejects every webhook when FOSO_WEBHOOK_SECRET is unset', async () => {
    const { app } = makeDeps({ webhookSecret: '' })
    expect((await app.request('/webhook/foso', signed({ legacy_post_id: 7 }, ''))).status).toBe(401)
  })

  it('400s on a signed body that is not JSON, and on a non-numeric id', async () => {
    const { app, calls } = makeDeps()
    const raw = 'not json'
    const bad = await app.request('/webhook/foso', {
      method: 'POST',
      body: raw,
      headers: { 'x-foso-signature': createHmac('sha256', SECRET).update(raw).digest('hex') },
    })
    expect(bad.status).toBe(400)

    const noId = await app.request('/webhook/foso', signed({ event: 'updated' }))
    expect(noId.status).toBe(400)
    expect(calls.syncOne).toHaveLength(0)
  })
})

describe('deleted event', () => {
  it('routes a `deleted` event through syncOne (which re-reads MySQL) with deleteIntent', async () => {
    // The legacy listener retries, so a `deleted` event can be replayed or arrive after
    // the post was republished. Liveness must come from MySQL, never from the event.
    const { app, calls } = makeDeps()
    const res = await app.request('/webhook/foso', signed({ legacy_post_id: 7, event: 'deleted' }))

    expect(res.status).toBe(200)
    expect(calls.syncOne).toEqual([[7, { deleteIntent: true }]])
  })

  it('never takes the unconditional syncDelete shortcut', async () => {
    // Reintroducing `sync.syncDelete(id)` in the deleted branch is the exact regression
    // that let a replayed webhook soft-delete an article MySQL still reports as live.
    const { app, syncDelete } = makeDeps()
    const res = await app.request('/webhook/foso', signed({ legacy_post_id: 7, event: 'deleted' }))

    expect(res.status).toBe(200)
    expect(syncDelete).not.toHaveBeenCalled()
  })
})

describe('health', () => {
  it('reports ok without any auth', async () => {
    const { app } = makeDeps()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('redirect ingest', () => {
  const REDIRECT_PHP = `
    Route::redirectI18n('/old-ramen', '/articles/dining/ramen-guide', 301);
    Route::redirectI18n("/promo-2024", "/articles/destinations/promo", 302);
  `

  const post = (body: string, token?: string): RequestInit => ({
    method: 'POST',
    body,
    headers: token === undefined ? {} : ({ 'x-admin-token': token } as Record<string, string>),
  })

  it.each([
    ['a missing header', undefined],
    ['a wrong token', 'not-the-token'],
    ['an empty token', ''],
    ['a prefix of the real token', ADMIN.slice(0, 5)],
  ])('rejects the ingest with %s and never writes', async (_label, token) => {
    const { app, writes } = makeDeps()
    const res = await app.request('/redirects', post(REDIRECT_PHP, token))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(writes).toHaveLength(0)
  })

  it('parses redirect.php and writes the rows it parsed', async () => {
    const { app, writes } = makeDeps()
    const res = await app.request('/redirects', post(REDIRECT_PHP, ADMIN))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, parsed: 2, written: 2 })
    expect(writes).toEqual([
      [
        { from_path: '/old-ramen', to_path: '/articles/dining/ramen-guide', status_code: 301 },
        { from_path: '/promo-2024', to_path: '/articles/destinations/promo', status_code: 302 },
      ],
    ])
  })

  // The backfill is re-runnable by design (n8n retries it), so the second post must
  // converge rather than report a conflict.
  it('reports the same counts when the same file is posted twice', async () => {
    const { app, writes } = makeDeps()
    const first = await app.request('/redirects', post(REDIRECT_PHP, ADMIN))
    const second = await app.request('/redirects', post(REDIRECT_PHP, ADMIN))

    expect(await first.json()).toEqual(await second.json())
    expect(writes).toHaveLength(2)
    expect(writes[0]).toEqual(writes[1])
  })

  it('rejects a body over the cap without parsing or writing', async () => {
    const { app, writes } = makeDeps()
    const oversized = `Route::redirectI18n('/a', '/b', 301);\n`.repeat(40_000)
    const res = await app.request('/redirects', post(oversized, ADMIN))

    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'request body too large' })
    expect(writes).toHaveLength(0)
  })

  // Auth is checked before the body is read at all: an unauthenticated caller should
  // never learn the size limit, and should never get to stream a body to us.
  it('answers an oversized unauthenticated request with 401, not 413', async () => {
    const { app, writes } = makeDeps()
    const oversized = `Route::redirectI18n('/a', '/b', 301);\n`.repeat(40_000)
    const res = await app.request('/redirects', post(oversized, 'not-the-token'))

    expect(res.status).toBe(401)
    expect(writes).toHaveLength(0)
  })

  // The route has no try/catch by design: app.onError turns any throw into a 500. That
  // matters because writeRedirects throws on a failed upsert, and the operator must see a
  // failure rather than `{ ok: true }` over a table that was never written.
  it('answers 500 when the write fails, never ok:true', async () => {
    const { app } = makeDeps({
      writeRedirects: async () => {
        throw new Error('upsert redirects failed: permission denied')
      },
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/redirects', post(REDIRECT_PHP, ADMIN))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal error' })
    err.mockRestore()
  })

  // The admin token is the only thing guarding this route, so a failure must not echo
  // anything an unauthenticated prober could use.
  it('does not leak the underlying error to the caller', async () => {
    const { app } = makeDeps({
      writeRedirects: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432')
      },
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = await (await app.request('/redirects', post(REDIRECT_PHP, ADMIN))).text()

    expect(body).not.toContain('ECONNREFUSED')
    expect(body).not.toContain('10.0.0.5')
    err.mockRestore()
  })

  it('reports zero rather than inventing a write when the file parses to nothing', async () => {
    const { app, writes } = makeDeps()
    const res = await app.request('/redirects', post('<?php // no redirects here', ADMIN))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, parsed: 0, written: 0 })
    expect(writes).toEqual([[]])
  })
})
