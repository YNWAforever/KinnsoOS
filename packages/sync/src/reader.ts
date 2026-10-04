import mysql from 'mysql2/promise'
import type { SyncConfig, LegacySslMode } from './config'
import type { LegacyPostBundle } from './types'
import { diagnoseLegacyConnectionError } from './diagnose'

export class LegacyReader {
  private pool: mysql.Pool
  private sslMode: LegacySslMode
  constructor(cfg: SyncConfig['legacy']) {
    // `cfg.ssl` is resolved and validated in config.ts (LEGACY_DB_SSL). It is absent
    // only for the explicit `disable` mode, so spreading cfg is what turns TLS on:
    // mysql2 negotiates plaintext whenever the key is missing.
    this.pool = mysql.createPool({ ...cfg, connectionLimit: 4, dateStrings: true, namedPlaceholders: true })
    this.sslMode = cfg.sslMode ?? (cfg.ssl ? 'require' : 'disable')
  }
  async close() { await this.pool.end() }

  /**
   * Every query goes through here so a connection failure arrives as something
   * actionable. TLS is on by default and this repository cannot see the legacy
   * server, so the single most likely first-deploy failure is a server with no
   * TLS — which mysql2 reports as "Server does not support secure connection",
   * naming neither the cause nor the one env var that fixes it.
   */
  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      const diagnosis = diagnoseLegacyConnectionError(error, this.sslMode)
      if (!diagnosis.tlsRelated) throw error
      throw new Error(diagnosis.message, { cause: error })
    }
  }

  /** Published, non-deleted post ids, ascending (for backfill pagination). */
  async allPostIds(afterId = 0, limit = 200): Promise<number[]> {
    return this.guard(async () => {
    const [rows] = await this.pool.query<any[]>(
      'select id from posts where id > :afterId and deleted_at is null and published_at is not null order by id asc limit :limit',
      { afterId, limit },
    )
    return rows.map((r) => Number(r.id))
    })
  }

  /** Assemble one post bundle (includes unpublished/soft-deleted posts so the sync can propagate removal). */
  async fetchPostBundle(id: number): Promise<LegacyPostBundle | null> {
    return this.guard(async () => {
    const [posts] = await this.pool.query<any[]>(
      'select id, slug, url, thumbnails, authors, regions, offers, rating, views, published_at, end_at, edit_at, source, deleted_at, updated_at from posts where id = :id',
      { id },
    )
    if (!posts.length) return null
    const post = posts[0]
    const slug: string = post.slug

    const [translations] = await this.pool.query<any[]>(
      'select locale, title, content, meta_tags, analyze_tags, faq_title, labels, validated_at, deleted_at from post_translations where post_id = :id order by locale asc',
      { id },
    )
    const [faqs] = await this.pool.query<any[]>(
      'select language, question, answer, weight from post_faqs where post_slug = :slug and deleted_at is null order by weight desc',
      { slug },
    )
    // FIND_IN_SET is whitespace-sensitive; legacy stores `posts.authors` space-free, but
    // strip any stray whitespace defensively so `author-a, author-b` still resolves both.
    const [authorRows] = await this.pool.query<any[]>(
      'select slug, language, name, image, job_title, description, show_in_author_page, labels from post_authors where deleted_at is null and find_in_set(slug, :authors) order by slug asc, language asc',
      { authors: (post.authors ?? '').replace(/\s+/g, '') },
    )
    const [catW] = await this.pool.query<any[]>(
      'select category_slug, weight from post_category_weights where post_slug = :slug and deleted_at is null order by category_slug asc',
      { slug },
    )
    const [tagRows] = await this.pool.query<any[]>(
      `select t.id as legacy_tag_id, t.slug, pa.weight, tt.locale, tt.name
       from post_attributes pa
       join tags t on t.id = pa.model_id
       left join tag_translations tt on tt.tag_id = t.id
       where pa.post_id = :id and pa.model_type = 'App\\\\Models\\\\Tag'
         and pa.deleted_at is null and t.deleted_at is null and t.is_active = 1
       order by t.slug asc, tt.locale asc`,
      { id },
    )

    const tagMap = new Map<string, LegacyPostBundle['tags'][number]>()
    for (const r of tagRows) {
      let t = tagMap.get(r.slug)
      if (!t) { t = { slug: r.slug, legacy_tag_id: Number(r.legacy_tag_id), weight: r.weight, translations: [] }; tagMap.set(r.slug, t) }
      if (r.locale && r.name) t.translations.push({ locale: r.locale, name: r.name })
    }

    return { post, translations, faqs, authors: authorRows, tags: [...tagMap.values()], categoryWeights: catW }
    })
  }

  /**
   * Exact size of the `isPostLive` set. The parity baseline uses this as a
   * scan-completeness tripwire: a scan that yields fewer bundles than this stopped
   * early, and a baseline built from a truncated scan would under-report drift while
   * looking healthy. Predicate mirrors allPostIds exactly.
   */
  async livePostCount(): Promise<number> {
    return this.guard(async () => {
      const [rows] = await this.pool.query<any[]>(
        'select count(*) as n from posts where deleted_at is null and published_at is not null',
        {},
      )
      return Number(rows[0]?.n ?? 0)
    })
  }

  /**
   * Per-locale UPPER BOUND on visible translations across the live set. The parity
   * baseline is built in TypeScript from the real transform, so this is not the
   * baseline — it is an independent ceiling the baseline must not exceed, which
   * catches a locale being double-counted or fanned out for a post that has no
   * translation row.
   *
   * Note the explicit `pt.deleted_at is null`: fetchPostBundle SELECTS that column
   * and filters it in the transform instead, so its query is not a safe template.
   */
  async legacyTranslationCeiling(): Promise<Record<string, number>> {
    return this.guard(async () => {
      const [rows] = await this.pool.query<any[]>(
        `select pt.locale as locale, count(*) as n
           from post_translations pt
           join posts p on p.id = pt.post_id
          where p.deleted_at is null
            and p.published_at is not null
            and pt.deleted_at is null
          group by pt.locale`,
        {},
      )
      const out: Record<string, number> = {}
      for (const r of rows) out[String(r.locale)] = Number(r.n)
      return out
    })
  }

  /**
   * A bounded sample of NON-live post ids, for the parity gate's negative fixtures.
   * The predicate is the negation of `isPostLive`, so this is a CANDIDATE GENERATOR
   * ONLY — the caller must re-assert `!isPostLive(bundle.post)` in TypeScript and drop
   * any row that disagrees, because SQL is not the definition.
   */
  async sampleNonLivePostIds(limit = 25): Promise<number[]> {
    return this.guard(async () => {
      const [rows] = await this.pool.query<any[]>(
        'select id from posts where deleted_at is not null or published_at is null order by id desc limit :limit',
        { limit },
      )
      return rows.map((r) => Number(r.id))
    })
  }

  /**
   * Every live post bundle, lazily. Deliberately composed from `allPostIds` +
   * `fetchPostBundle` rather than expressed as new bulk SQL: no legacy schema dump
   * exists in this repository, so every new column name would be unverifiable until
   * it failed against production MySQL. This adds zero new SQL and inherits both
   * queries' guard().
   *
   * Ids whose post row vanished between the page read and the bundle read are
   * skipped rather than yielded as a hole.
   */
  async *streamPostBundles(opts: { pageSize?: number } = {}): AsyncGenerator<LegacyPostBundle, void, void> {
    const pageSize = opts.pageSize ?? 200
    let afterId = 0
    for (;;) {
      const ids = await this.allPostIds(afterId, pageSize)
      if (!ids.length) return
      for (const id of ids) {
        const bundle = await this.fetchPostBundle(id)
        if (bundle) yield bundle
      }
      afterId = ids[ids.length - 1]
    }
  }
}
