export interface ParsedMeta {
  metaTitle?: string
  metaDescription?: string
  metaKeywords?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
}

const pick = (o: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return undefined
}

export function parseMetaTags(raw: string | null | undefined): ParsedMeta {
  if (!raw) return {}
  let o: Record<string, unknown>
  try {
    o = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!o || typeof o !== 'object') return {}
  return {
    metaTitle: pick(o, 'meta_title', 'title'),
    metaDescription: pick(o, 'meta_description', 'description'),
    metaKeywords: pick(o, 'meta_keywords', 'keywords'),
    ogTitle: pick(o, 'og_title', 'og:title'),
    ogDescription: pick(o, 'og_description', 'og:description'),
    ogImage: pick(o, 'og_image', 'og:image'),
  }
}

/**
 * meta_tags is never translated in legacy (always zh-hk). For non-zh-hk locales,
 * a stored description equal to the zh-hk value (or empty) is a leak → use the
 * locale summary instead.
 */
export function resolveMetaDescription(
  locale: string,
  stored: string | undefined,
  zhHkValue: string | undefined,
  summary: string,
): string {
  if (locale === 'zh-hk') return stored || summary
  if (!stored || stored === zhHkValue) return summary
  return stored
}
