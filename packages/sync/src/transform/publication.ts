import { validatePublicExternalUrl } from '@kinnso/honesty'
import type { AuthorRow, TransformWarning, TranslationRow } from '../types'

export interface PublicationInput {
  articleSlug: string
  authorSlugs: string[]
  translations: TranslationRow[]
  authors: AuthorRow[]
}

export interface PublicationWarning extends TransformWarning {
  kind: 'publication'
  code: 'missing_translation' | 'translation_too_shallow' | 'translation_too_short' | 'invalid_external_link' | 'invalid_author'
}

const EXCLUDED_VISIBLE_KEYS = new Set([
  'id',
  'type',
  'image',
  'thumbnail',
  'original',
  'link',
  'href',
  'url',
  'website',
  'phone',
  'time',
  'price',
  'attraction',
])
const LINK_KEYS = new Set(['link', 'href', 'url', 'website'])
const HREF_PATTERN = /\bhref\s*=\s*(?:(["'])(.*?)\1|([^\s"'=<>`]+))/gi

export function countLocaleWords(text: string, locale: string): number {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' })
  return [...segmenter.segment(text)].filter((segment) => segment.isWordLike).length
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function collectVisibleText(value: unknown, key?: string): string[] {
  if (key && EXCLUDED_VISIBLE_KEYS.has(key.toLowerCase())) return []
  if (typeof value === 'string') {
    const text = stripHtml(value)
    return text ? [text] : []
  }
  if (Array.isArray(value)) return value.flatMap((entry) => collectVisibleText(entry))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([childKey, child]) => collectVisibleText(child, childKey))
}

function warning(
  input: PublicationInput,
  code: PublicationWarning['code'],
  detail: string,
  locale?: string,
  path?: string,
): PublicationWarning {
  return {
    kind: 'publication',
    code,
    detail,
    articleSlug: input.articleSlug,
    ...(locale ? { locale } : {}),
    ...(path ? { path } : {}),
  }
}

function validateLink(
  input: PublicationInput,
  raw: string,
  locale: string,
  path: string,
  warnings: PublicationWarning[],
): void {
  const issue = validatePublicExternalUrl(raw)
  if (issue) {
    warnings.push(warning(input, 'invalid_external_link', `${issue}: ${raw.trim()}`, locale, path))
  }
}

function collectLinkWarnings(
  input: PublicationInput,
  value: unknown,
  locale: string,
  path: string,
  warnings: PublicationWarning[],
  key?: string,
): void {
  if (typeof value === 'string') {
    if (key && LINK_KEYS.has(key.toLowerCase())) validateLink(input, value, locale, path, warnings)
    for (const match of value.matchAll(HREF_PATTERN)) {
      validateLink(input, match[2] ?? match[3] ?? '', locale, path, warnings)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectLinkWarnings(input, entry, locale, `${path}[${index}]`, warnings))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [childKey, child] of Object.entries(value)) {
    collectLinkWarnings(input, child, locale, `${path}.${childKey}`, warnings, childKey)
  }
}

function hasEligibleAuthor(input: PublicationInput, locale: string): boolean {
  const requested = new Set(input.authorSlugs.map((slug) => slug.trim()).filter(Boolean))
  if (!requested.size) return false

  return input.authors.some((author) => {
    const slug = author.slug.trim()
    const name = author.name.trim().replace(/\s+/g, ' ')
    return requested.has(slug)
      && author.locale === locale
      && author.is_active !== false
      && Boolean(name)
      && slug.toLowerCase() !== 'jane-doe'
      && name.toLowerCase() !== 'jane doe'
  })
}

export function validatePublication(input: PublicationInput): PublicationWarning[] {
  const warnings: PublicationWarning[] = []

  if (input.translations.length === 0) {
    warnings.push(warning(
      input,
      'missing_translation',
      'expected at least one surviving translation',
      undefined,
      'translations',
    ))
  }

  const resolvedAuthorLocales = new Set(
    input.translations
      .map((translation) => translation.locale)
      .filter((locale) => hasEligibleAuthor(input, locale)),
  )
  if (resolvedAuthorLocales.size === 0) {
    warnings.push(warning(
      input,
      'invalid_author',
      'no requested author resolves to an active, named translation row',
      undefined,
      'authors',
    ))
  }

  for (const translation of input.translations) {
    const locale = translation.locale
    const contentPath = `translations.${locale}.content`
    const blocks = Array.isArray(translation.content) ? translation.content : []
    const blockTexts = blocks.map((block) => collectVisibleText(block).join(' ').replace(/\s+/g, ' ').trim())
    const nonemptyBlockCount = blockTexts.filter(Boolean).length
    const visibleText = blockTexts.filter(Boolean).join(' ')

    if (nonemptyBlockCount < 3) {
      warnings.push(warning(
        input,
        'translation_too_shallow',
        `expected at least 3 nonempty blocks, found ${nonemptyBlockCount}`,
        locale,
        contentPath,
      ))
    }

    const wordCount = countLocaleWords(visibleText, locale)
    if (wordCount < 150) {
      warnings.push(warning(
        input,
        'translation_too_short',
        `expected at least 150 visible words, found ${wordCount}`,
        locale,
        contentPath,
      ))
    }

    collectLinkWarnings(input, translation, locale, `translations.${locale}`, warnings)

    if (resolvedAuthorLocales.size > 0 && !resolvedAuthorLocales.has(locale)) {
      warnings.push(warning(
        input,
        'invalid_author',
        'no requested author resolves to an active, named locale row',
        locale,
        `translations.${locale}.authors`,
      ))
    }
  }

  return warnings
}
