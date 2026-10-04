export const LOCALES = ['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x)
}

/**
 * Split `/zh-hk/rest` -> { locale:'zh-hk', rest:'/rest' }; no prefix -> { locale:null, rest:path }.
 * `pathname` must start with `/` as provided by Next.js `request.nextUrl.pathname`.
 */
export function parsePathname(pathname: string): { locale: Locale | null; rest: string } {
  const seg = pathname.split('/')[1] ?? ''
  if (isLocale(seg)) {
    const rest = pathname.slice(seg.length + 1)
    return { locale: seg, rest: rest === '' ? '/' : rest }
  }
  return { locale: null, rest: pathname }
}

const HTML_LANG: Record<Locale, string> = {
  en: 'en', 'zh-hk': 'zh-Hant-HK', 'zh-tw': 'zh-Hant-TW', 'zh-cn': 'zh-Hans-CN',
  ja: 'ja', ko: 'ko', th: 'th',
}
export const htmlLang = (l: Locale): string => HTML_LANG[l]

export const URL_CATEGORIES = ['destinations', 'dining', 'shopping'] as const
export type UrlCategory = (typeof URL_CATEGORIES)[number]
export type DbCategory = 'destination' | 'dining' | 'shopping'

const URL_TO_DB: Record<UrlCategory, DbCategory> = {
  destinations: 'destination', dining: 'dining', shopping: 'shopping',
}
const DB_TO_URL: Record<DbCategory, UrlCategory> = {
  destination: 'destinations', dining: 'dining', shopping: 'shopping',
}
/** null for unrouted segments (e.g. legacy `promotion`). */
export function toDbCategory(seg: string): DbCategory | null {
  return Object.hasOwn(URL_TO_DB, seg) ? URL_TO_DB[seg as UrlCategory] : null
}
export function toUrlCategory(cat: string): UrlCategory | null {
  return Object.hasOwn(DB_TO_URL, cat) ? DB_TO_URL[cat as DbCategory] : null
}
