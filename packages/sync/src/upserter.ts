import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { UpsertPayload } from './types'

type DB = SupabaseClient<Database>

/**
 * Compare two timestamps as INSTANTS, not as strings. The two sides are formatted
 * differently and never match textually: PostgREST renders `timestamptz` as
 * `2026-06-01T00:00:00+00:00`, while the transform produces `Date.toISOString()`
 * (`2026-06-01T00:00:00.000Z`). A string `===` would make the unchanged-skip below
 * dead code for every published article, so each sync would re-run the child
 * delete+reinsert even when nothing changed.
 *
 * Fail-safe by construction: `Date.parse` yields NaN for anything unparseable and
 * `NaN === NaN` is false, so a malformed value forces a full re-sync rather than a
 * wrong skip.
 */
const sameInstant = (a: string | null, b: string | null): boolean =>
  a === b || (!!a && !!b && Date.parse(a) === Date.parse(b))

export class Upserter {
  constructor(private db: DB, private cdn: string) {}

  /**
   * Idempotent upsert of one article and its children, in dependency order.
   *
   * Durability: every Supabase call is error-checked and throws on failure (so the
   * orchestrator / n8n retries), and the sync watermark (`source_hash` /
   * `source_synced_at`) is advanced LAST — only after all child rows are written.
   * A mid-sequence failure therefore leaves `source_hash` stale, so the next sync
   * re-runs the article instead of skipping a half-written one.
   */
  async upsert(payload: UpsertPayload & { warnings?: unknown[] }): Promise<{ skipped: boolean }> {
    const { article, translations, faqs, authors, tags, tagSlugs } = payload

    const { data: existing, error: selErr } = await this.db
      .from('articles')
      .select('id, source_hash, published_at, views, deleted_at, source_synced_at')
      .eq('legacy_post_id', article.legacy_post_id!)
      .maybeSingle()
    if (selErr) throw new Error(`select existing article ${article.legacy_post_id} failed: ${selErr.message}`)

    if (
      existing
      && existing.source_hash === article.source_hash
      && sameInstant(existing.published_at, article.published_at ?? null)
      && !existing.deleted_at
    ) {
      return { skipped: true } // unchanged
    }

    if (authors.length) {
      const { error } = await this.db.from('article_authors').upsert(authors, { onConflict: 'slug,locale' })
      if (error) throw new Error(`upsert authors failed: ${error.message}`)
    }

    const tagIdBySlug = new Map<string, string>()
    for (const { tag, translations: tts } of tags) {
      const { data: t, error } = await this.db
        .from('article_tags')
        .upsert(tag, { onConflict: 'slug' })
        .select('id, slug')
        .single()
      if (error || !t) throw new Error(`upsert tag ${tag.slug} failed: ${error?.message ?? 'no row returned'}`)
      tagIdBySlug.set(t.slug, t.id)
      if (tts.length) {
        const { error: ttErr } = await this.db
          .from('article_tag_translations')
          .upsert(tts.map((x) => ({ ...x, tag_id: t.id })), { onConflict: 'tag_id,locale' })
        if (ttErr) throw new Error(`upsert tag_translations ${tag.slug} failed: ${ttErr.message}`)
      }
    }

    // Ensure the article row exists (to obtain its id for child FKs) WITHOUT advancing
    // the watermark yet. `views` are seed-only: preserve the existing value.
    const baseRow = {
      ...article,
      source_hash: existing?.source_hash ?? null,
      source_synced_at: existing?.source_synced_at ?? null,
    }
    if (existing) baseRow.views = existing.views
    const { data: art, error: artErr } = await this.db
      .from('articles')
      .upsert(baseRow, { onConflict: 'legacy_post_id' })
      .select('id')
      .single()
    if (artErr || !art) throw new Error(`upsert article ${article.legacy_post_id} failed: ${artErr?.message ?? 'no row returned'}`)
    const articleId = art.id

    await this.replaceTranslations(articleId, translations)
    await this.replaceFaqs(articleId, faqs)
    await this.replaceTagMap(articleId, tagSlugs, tagIdBySlug)

    // Children written → NOW advance the watermark so subsequent syncs can skip.
    const { error: stampErr } = await this.db
      .from('articles')
      .update({ source_hash: article.source_hash, source_synced_at: new Date().toISOString() })
      .eq('id', articleId)
    if (stampErr) throw new Error(`stamp watermark ${article.legacy_post_id} failed: ${stampErr.message}`)

    return { skipped: false }
  }

  private async replaceTranslations(articleId: string, rows: UpsertPayload['translations']): Promise<void> {
    const { error: delErr } = await this.db.from('article_translations').delete().eq('article_id', articleId)
    if (delErr) throw new Error(`delete translations failed: ${delErr.message}`)
    if (rows.length) {
      const { error } = await this.db.from('article_translations').insert(rows.map((t) => ({ ...t, article_id: articleId })))
      if (error) throw new Error(`insert translations failed: ${error.message}`)
    }
  }

  private async replaceFaqs(articleId: string, rows: UpsertPayload['faqs']): Promise<void> {
    const { error: delErr } = await this.db.from('article_faqs').delete().eq('article_id', articleId)
    if (delErr) throw new Error(`delete faqs failed: ${delErr.message}`)
    if (rows.length) {
      const { error } = await this.db.from('article_faqs').insert(rows.map((f) => ({ ...f, article_id: articleId })))
      if (error) throw new Error(`insert faqs failed: ${error.message}`)
    }
  }

  private async replaceTagMap(articleId: string, tagSlugs: string[], tagIdBySlug: Map<string, string>): Promise<void> {
    const { error: delErr } = await this.db.from('article_tag_map').delete().eq('article_id', articleId)
    if (delErr) throw new Error(`delete tag_map failed: ${delErr.message}`)
    const mapRows = tagSlugs
      .map((s) => tagIdBySlug.get(s))
      .filter((id): id is string => Boolean(id))
      .map((tag_id) => ({ article_id: articleId, tag_id }))
    if (mapRows.length) {
      const { error } = await this.db.from('article_tag_map').insert(mapRows)
      if (error) throw new Error(`insert tag_map failed: ${error.message}`)
    }
  }

  async syncDelete(legacyPostId: number): Promise<void> {
    const { error } = await this.db
      .from('articles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('legacy_post_id', legacyPostId)
    if (error) throw new Error(`syncDelete ${legacyPostId} failed: ${error.message}`)
  }
}
