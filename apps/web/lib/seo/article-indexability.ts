import { parseBlocks, type BaseBlock } from '@/lib/articles/blocks'
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
} from '@/lib/i18n/config'

export const MIN_ARTICLE_VISIBLE_CHARACTERS = 300

export interface ArticleSeoTranslation {
  locale: Locale
  title: string | null
  summary: string | null
  metaDescription: string | null
  content: unknown
}

export interface ArticleIndexingDecision {
  index: boolean
  canonicalLocale: Locale | null
  alternateLocales: readonly Locale[]
}

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value : ''

function visibleFields(block: BaseBlock): string[] {
  if (block.type === 'text' || block.type === 'number-box') {
    return [
      stringValue(block.title),
      stringValue(block.subtitle),
      stringValue(block.content),
    ]
  }
  if (block.type === 'offer-box') {
    return [stringValue(block.title), stringValue(block.content)]
  }
  if (block.type === 'info-box' || block.type === 'map') {
    return [stringValue(block.content)]
  }
  if (block.type === 'detail-box') {
    const address = block.address as { label?: unknown } | undefined
    const website = block.website as { label?: unknown } | undefined
    return [
      stringValue(block.title),
      stringValue(block.time),
      stringValue(block.price),
      stringValue(block.phone),
      stringValue(address?.label),
      stringValue(website?.label),
    ]
  }
  if (block.type === 'multiple-image') {
    const images = Array.isArray(block.images) ? block.images : []
    return images.map((image) =>
      stringValue((image as { desc?: unknown }).desc),
    )
  }
  return []
}

function normalizeVisibleText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function articleVisibleCharacterCount(content: unknown): number {
  const text = parseBlocks(content)
    .flatMap(visibleFields)
    .join(' ')
  return Array.from(normalizeVisibleText(text)).length
}

export function isArticleTranslationIndexable(
  translation: ArticleSeoTranslation,
  isCoupon: boolean,
): boolean {
  if (!translation.title?.trim()) return false
  if (!(translation.metaDescription?.trim() || translation.summary?.trim())) {
    return false
  }
  if (isCoupon && translation.locale === DEFAULT_LOCALE) return false
  return articleVisibleCharacterCount(translation.content) >=
    MIN_ARTICLE_VISIBLE_CHARACTERS
}

export function indexableArticleLocales(
  translations: readonly ArticleSeoTranslation[],
  isCoupon: boolean,
): Locale[] {
  const indexable = new Set(
    translations
      .filter((translation) =>
        isArticleTranslationIndexable(translation, isCoupon))
      .map((translation) => translation.locale),
  )
  return LOCALES.filter((locale) => indexable.has(locale))
}

export function resolveArticleIndexing(input: {
  requestedLocale: Locale
  resolvedLocale: Locale
  indexableLocales: readonly Locale[]
}): ArticleIndexingDecision {
  const alternateLocales = LOCALES.filter((locale) =>
    input.indexableLocales.includes(locale))
  const index =
    input.requestedLocale === input.resolvedLocale &&
    alternateLocales.includes(input.requestedLocale)
  const canonicalLocale = index
    ? input.requestedLocale
    : alternateLocales.includes(DEFAULT_LOCALE)
      ? DEFAULT_LOCALE
      : alternateLocales[0] ?? null
  return { index, canonicalLocale, alternateLocales }
}
