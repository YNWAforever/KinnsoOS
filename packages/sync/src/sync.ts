import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { loadConfig, type SyncConfig } from './config'
import { LegacyReader } from './reader'
import { Upserter } from './upserter'
import { transformPost } from './transform'
import { writeRedirects } from './redirect-writer'
import type { SeoRedirect } from './types'

/**
 * A legacy post belongs in the public read-model only if it is published and not
 * deleted. Unpublished posts (legacy `unpublish()` sets `published_at = null`) and
 * soft-deleted posts are propagated as a soft-delete so they leave the new stack.
 * The publication WINDOW (`published_at <= now`, `end_at`) is enforced by RLS at read time.
 */
export function isPostLive(post: { published_at: string | null; deleted_at: string | null }): boolean {
  return !post.deleted_at && !!post.published_at
}

export interface SyncOneOptions {
  /**
   * Set when the caller was told the post was deleted (a legacy `deleted` webhook).
   * It does NOT force a delete — liveness is still derived from MySQL, so a replayed
   * or out-of-order event about a post that is live again is a no-op rather than a
   * silent unpublish. It only covers the one case MySQL can no longer answer: the row
   * is gone entirely (hard delete), where "not found" must propagate the removal
   * instead of returning a no-op.
   */
  deleteIntent?: boolean
}

export function makeSync(cfg: SyncConfig = loadConfig()) {
  const reader = new LegacyReader(cfg.legacy)
  const db = createClient<Database>(cfg.supabaseUrl, cfg.serviceRoleKey)
  const up = new Upserter(db, cfg.cdnBase)

  async function syncOne(legacyPostId: number, opts: SyncOneOptions = {}) {
    const bundle = await reader.fetchPostBundle(legacyPostId)
    if (!bundle) {
      if (!opts.deleteIntent) return { ok: false as const, reason: 'not_found' as const }
      await up.syncDelete(legacyPostId)
      return { ok: true as const, deleted: true as const }
    }
    if (!isPostLive(bundle.post)) {
      await up.syncDelete(legacyPostId)
      return { ok: true as const, deleted: true as const }
    }
    const payload = transformPost(bundle, cfg.cdnBase, { legacyTimezone: cfg.legacyTimezone })
    for (const w of payload.warnings) console.warn(`[sync] ${w.kind} ${w.detail}`)
    const res = await up.upsert(payload)
    return { ok: true as const, skipped: res.skipped, warnings: payload.warnings }
  }

  async function backfill(onProgress?: (n: number) => void) {
    let afterId = 0
    let total = 0
    let skipped = 0
    let warnings = 0
    for (;;) {
      const ids = await reader.allPostIds(afterId, 200)
      if (!ids.length) break
      for (const id of ids) {
        const r = await syncOne(id)
        total++
        if ('skipped' in r && r.skipped) skipped++
        if ('warnings' in r && r.warnings) warnings += r.warnings.length
        onProgress?.(total)
      }
      afterId = ids[ids.length - 1]
    }
    return { total, skipped, warnings }
  }

  return {
    syncOne,
    syncDelete: (id: number) => up.syncDelete(id),
    backfill,
    // Exposed here so the redirect ingest reuses this one service-role client rather
    // than opening a second one from the same config.
    writeRedirects: (rows: SeoRedirect[]) => writeRedirects(db, rows),
    close: () => reader.close(),
  }
}
