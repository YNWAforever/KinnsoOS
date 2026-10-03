import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { SeoRedirect } from './types'

type DB = SupabaseClient<Database>

/**
 * Write the legacy redirect map into `seo_redirects`, which `apps/web/proxy.ts` reads
 * at request time to serve 307s. Nothing else in production writes that table, so
 * without this every legacy URL 404s on cutover.
 *
 * Idempotent by construction: `seo_redirects.from_path` is `not null unique`, so the
 * ingest upserts on that column and a re-run converges rather than colliding.
 */
export async function writeRedirects(db: DB, rows: SeoRedirect[]): Promise<{ written: number }> {
  // An empty parse writes nothing rather than reporting a successful no-op write.
  if (rows.length === 0) return { written: 0 }

  // Postgres rejects a single statement carrying two rows with the same conflict key
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), so one duplicated
  // line in redirect.php would fail the entire ingest. Collapse duplicates first, keeping
  // the FIRST occurrence: legacy routes are matched in registration order, so the first
  // entry is the one the legacy site actually serves.
  const byFromPath = new Map<string, SeoRedirect>()
  for (const redirect of rows) {
    if (!byFromPath.has(redirect.from_path)) byFromPath.set(redirect.from_path, redirect)
  }
  const deduped = [...byFromPath.values()]

  const { error } = await db.from('seo_redirects').upsert(deduped, { onConflict: 'from_path' })
  if (error) throw new Error(`upsert redirects failed: ${error.message}`)
  return { written: deduped.length }
}
