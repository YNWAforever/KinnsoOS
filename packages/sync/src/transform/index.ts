import type { LegacyPostBundle, TransformWarning, TranslationRow, UpsertPayload } from '../types'
import { buildArticleRow } from './article'
import { tryParseBlocks, deriveSummary } from './content'
import { parseMetaTags, resolveMetaDescription } from './meta'
import { transformTags } from './tags'
import { transformAuthors } from './authors'
import { transformFaqs } from './faqs'
import { csvToArray, cdnUrl } from './arrays'
import { validatePublication } from './publication'
import { legacyToIso } from './datetime'

export interface TransformOptions {
  /** Zone the legacy DATETIME columns were written in; see config.ts `legacyTimezone`. */
  legacyTimezone?: string
}

export function transformPost(
  bundle: LegacyPostBundle,
  cdn: string,
  opts: TransformOptions = {},
): UpsertPayload & { warnings: TransformWarning[] } {
  const { legacyTimezone = 'UTC' } = opts
  const warnings: TransformWarning[] = []
  const { tags, tagSlugs } = transformTags(bundle.tags)
  const { row: article, categoryDefaulted } = buildArticleRow(bundle, tagSlugs, cdn, legacyTimezone)
  if (categoryDefaulted) warnings.push({
    kind: 'category_defaulted',
    code: 'category_defaulted',
    detail: bundle.post.slug,
    articleSlug: bundle.post.slug,
  })

  const zhHk = bundle.translations.find((t) => t.locale === 'zh-hk')
  const zhHkMetaDesc = parseMetaTags(zhHk?.meta_tags ?? null).metaDescription

  const translations: TranslationRow[] = bundle.translations
    .filter((t) => !t.deleted_at)
    .map((t) => {
      const parsed = tryParseBlocks(t.content, cdn)
      // null ⇒ genuine parse failure; [] ⇒ legitimately empty content (no warning).
      if (t.content && parsed === null) {
        warnings.push({
          kind: 'content_parse_failed',
          code: 'content_parse_failed',
          detail: `${bundle.post.slug}:${t.locale}`,
          articleSlug: bundle.post.slug,
          locale: t.locale,
          path: `translations.${t.locale}.content`,
        })
      }
      const blocks = parsed ?? []
      const summary = deriveSummary(blocks)
      const meta = parseMetaTags(t.meta_tags)
      const description = resolveMetaDescription(t.locale, meta.metaDescription, zhHkMetaDesc, summary)
      // og_image from meta_tags is a raw legacy ref — rewrite it through the CDN like thumbnails.
      const ogImage = meta.ogImage ? cdnUrl(meta.ogImage, cdn) : (article.thumbnails?.[0] ?? null)
      return {
        article_id: '', // filled by upserter
        locale: t.locale,
        title: t.title,
        // blocks are JSON-serializable; Json's index type is stricter than Record<string,unknown>
        content: blocks as unknown as TranslationRow['content'],
        summary,
        meta_title: meta.metaTitle ?? t.title,
        // Never persist an empty description — store null so Plan 3 can apply its own fallback.
        meta_description: description || null,
        meta_keywords: meta.metaKeywords ?? null,
        og_title: meta.ogTitle ?? meta.metaTitle ?? t.title,
        og_description: (meta.ogDescription ?? description) || null,
        og_image: ogImage,
        faq_title: t.faq_title ?? null,
        labels: csvToArray(t.labels),
        analyze_tags: csvToArray(t.analyze_tags),
        validated_at: legacyToIso(t.validated_at, legacyTimezone),
      }
    })

  const authors = transformAuthors(bundle.authors, cdn)
  if (article.published_at !== null) {
    const publicationWarnings = validatePublication({
      articleSlug: article.slug,
      authorSlugs: article.authors ?? [],
      translations,
      authors,
    })
    if (publicationWarnings.length > 0) {
      article.published_at = null
      warnings.push(...publicationWarnings)
    }
  }

  return {
    article,
    translations,
    faqs: transformFaqs(bundle.faqs).map((f) => ({ ...f, article_id: '' })),
    authors,
    tags,
    tagSlugs,
    warnings,
  }
}
