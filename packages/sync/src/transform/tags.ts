import type { LegacyPostBundle, TagRow, TagTransRow } from '../types'

export function transformTags(
  legacyTags: LegacyPostBundle['tags'],
): { tags: Array<{ tag: TagRow; translations: TagTransRow[] }>; tagSlugs: string[] } {
  const kept = legacyTags.filter((t) => !t.slug.startsWith('llm1-'))
  const tags = kept.map((t) => ({
    tag: { slug: t.slug, legacy_tag_id: t.legacy_tag_id } as TagRow,
    translations: t.translations.map((tr) => ({ tag_id: '', locale: tr.locale, name: tr.name }) as TagTransRow),
  }))
  return { tags, tagSlugs: kept.map((t) => t.slug) }
}
