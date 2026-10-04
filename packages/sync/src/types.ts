import type { Database } from '@kinnso/db'

export type ArticleRow = Database['public']['Tables']['articles']['Insert']
export type TranslationRow = Database['public']['Tables']['article_translations']['Insert']
export type AuthorRow = Database['public']['Tables']['article_authors']['Insert']
export type FaqRow = Database['public']['Tables']['article_faqs']['Insert']
export type TagRow = Database['public']['Tables']['article_tags']['Insert']
export type TagTransRow = Database['public']['Tables']['article_tag_translations']['Insert']
export type SeoRedirect = Database['public']['Tables']['seo_redirects']['Insert']

export interface TransformWarning {
  kind: string
  code: string
  detail: string
  articleSlug: string
  locale?: string
  path?: string
}

/** Raw rows read from legacy MySQL for ONE post (column names = legacy columns). */
export interface LegacyPostBundle {
  post: {
    id: number
    slug: string
    url: string | null
    thumbnails: string | null
    authors: string | null
    regions: string | null
    offers: string | null
    rating: number | null
    views: number | null
    published_at: string | null
    end_at: string | null
    edit_at: string | null
    source: string | null
    deleted_at: string | null
    updated_at: string | null
  }
  translations: Array<{
    locale: string
    title: string | null
    content: string | null // raw JSON text
    meta_tags: string | null // raw JSON text (always zh-hk values)
    analyze_tags: string | null
    faq_title: string | null
    labels: string | null
    validated_at: string | null
    deleted_at: string | null
  }>
  faqs: Array<{ language: string; question: string; answer: string; weight: number | null }>
  authors: Array<{
    slug: string; language: string; name: string; image: string | null;
    job_title: string | null; description: string | null; show_in_author_page: number | null; labels: string | null
  }>
  tags: Array<{ slug: string; legacy_tag_id: number; weight: number | null; translations: Array<{ locale: string; name: string }> }>
  categoryWeights: Array<{ category_slug: string; weight: number | null }>
}

export interface UpsertPayload {
  article: ArticleRow
  translations: TranslationRow[]
  faqs: FaqRow[]
  authors: AuthorRow[]
  tags: Array<{ tag: TagRow; translations: TagTransRow[] }>
  tagSlugs: string[] // for article_tag_map (resolved to ids by the upserter)
}
