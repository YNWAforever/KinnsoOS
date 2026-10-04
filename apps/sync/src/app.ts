import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createHmac } from 'node:crypto'
import { parseRedirectsPhp, type SeoRedirect } from '@kinnso/sync'
import { safeEqual } from './safe-equal'

/**
 * `redirect.php` is a source file, not user input, but the route still accepts a POST
 * body and must not be an unbounded buffer. 1 MiB is roughly 13,000 redirect lines —
 * far beyond the real map, and small enough to reject a runaway body early.
 */
const MAX_REDIRECTS_BODY_BYTES = 1024 * 1024

/**
 * The slice of `makeSync()` the HTTP layer actually uses. Declared structurally (rather
 * than as `ReturnType<typeof makeSync>`) so tests can pass a stub without a live MySQL
 * pool or Supabase client — `makeSync()` opens both in its constructor.
 */
export interface SyncService {
  syncOne(legacyPostId: number, opts?: { deleteIntent?: boolean }): Promise<Record<string, unknown>>
  backfill(): Promise<Record<string, unknown>>
}

export interface AppDeps {
  sync: SyncService
  /** HMAC key shared with the legacy webhook publisher. Empty ⇒ every webhook is rejected. */
  webhookSecret: string
  /** Admin bearer token for /sync/:id, /backfill and /redirects. Empty ⇒ all three are closed. */
  adminToken: string
  revalidate: (paths: string[]) => Promise<void>
  /**
   * Writes the parsed legacy redirect map. Injected like `sync` so the HTTP layer never
   * holds a Supabase client and this route stays unit-testable without one.
   */
  writeRedirects: (rows: SeoRedirect[]) => Promise<{ written: number }>
}

export function createApp(deps: AppDeps) {
  const app = new Hono()

  function verifyHmac(raw: string, sig: string | undefined): boolean {
    if (!deps.webhookSecret || !sig) return false
    const expected = createHmac('sha256', deps.webhookSecret).update(raw).digest('hex')
    return safeEqual(expected, sig)
  }

  const isAdmin = (token: string | undefined): boolean => safeEqual(deps.adminToken, token ?? '')

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/webhook/foso', async (c) => {
    const raw = await c.req.text()
    if (!verifyHmac(raw, c.req.header('x-foso-signature'))) return c.json({ error: 'bad signature' }, 401)
    let body: { legacy_post_id?: unknown; event?: unknown }
    try {
      body = JSON.parse(raw)
    } catch {
      return c.json({ error: 'invalid json' }, 400)
    }
    const id = Number(body.legacy_post_id)
    if (!Number.isFinite(id)) return c.json({ error: 'invalid legacy_post_id' }, 400)
    // Every event — including `deleted` — re-reads MySQL and derives liveness from it.
    // The legacy listener is a ShouldQueue job with HTTP retries, so events replay and
    // arrive out of order; acting on the event's word alone would let a stale `deleted`
    // hide an article that is live again. `deleteIntent` only tells syncOne how to read
    // a MISSING row (hard delete ⇒ propagate the delete, rather than a silent no-op).
    const res = await deps.sync.syncOne(id, { deleteIntent: body.event === 'deleted' })
    await deps.revalidate(['/articles']).catch(() => {}) // Plan 3 supplies concrete paths
    return c.json(res)
  })

  app.post('/sync/:id', async (c) => {
    if (!isAdmin(c.req.header('x-admin-token'))) return c.json({ error: 'unauthorized' }, 401)
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    return c.json(await deps.sync.syncOne(id))
  })

  app.post('/backfill', async (c) => {
    if (!isAdmin(c.req.header('x-admin-token'))) return c.json({ error: 'unauthorized' }, 401)
    return c.json(await deps.sync.backfill())
  })

  /**
   * Ingest the legacy redirect map (the contents of `redirect.php`) into `seo_redirects`.
   * `apps/web/proxy.ts` already serves 307s from that table; until this route existed
   * nothing in production wrote it, so every legacy URL would 404 on cutover.
   *
   * The guard runs as middleware rather than inline so it precedes `bodyLimit`: an
   * unauthenticated caller is turned away before streaming a body, and never learns the
   * size cap. The other admin routes read no body, so they keep their inline check.
   */
  app.post(
    '/redirects',
    async (c, next) => {
      if (!isAdmin(c.req.header('x-admin-token'))) return c.json({ error: 'unauthorized' }, 401)
      await next()
    },
    bodyLimit({
      maxSize: MAX_REDIRECTS_BODY_BYTES,
      onError: (c) => c.json({ error: 'request body too large' }, 413),
    }),
    async (c) => {
      const parsed = parseRedirectsPhp(await c.req.text())
      const { written } = await deps.writeRedirects(parsed)
      return c.json({ ok: true, parsed: parsed.length, written })
    },
  )

  // Fail closed: any unhandled error in a handler returns 500 rather than crashing the process.
  app.onError((err, c) => {
    console.error('[sync-app] unhandled error', err)
    return c.json({ error: 'internal error' }, 500)
  })

  return app
}
