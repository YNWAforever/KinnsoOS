import { DEFAULT_LOCALE, parsePathname } from '@/lib/i18n/config'

export type Resolution =
  | { type: 'next' }
  | { type: 'redirect'; status: 301 | 307; location: string }

/** Decide redirect/locale-guard for a pathname given the locale-agnostic redirect map. */
export function resolveRequest(pathname: string, redirects: Map<string, string>): Resolution {
  const { locale, rest } = parsePathname(pathname)
  const target = redirects.get(rest)
  if (target) {
    const l = locale ?? DEFAULT_LOCALE
    return { type: 'redirect', status: 301, location: `/${l}${target}` }
  }
  if (!locale) {
    const suffix = pathname === '/' ? '' : pathname
    return { type: 'redirect', status: 307, location: `/${DEFAULT_LOCALE}${suffix}` }
  }
  return { type: 'next' }
}
