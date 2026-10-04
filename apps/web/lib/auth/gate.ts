import { LOCALES } from '@/lib/i18n/config'
import { signInHref } from '@/lib/auth/return-path'

export type GateDecision =
  | { type: 'allow' }
  | { type: 'redirect'; location: string }

/**
 * Pure function — given a pathname and whether a session exists,
 * decide whether to allow the request or redirect to sign-in.
 *
 * Matches locale-prefixed paths that require a signed-in viewer.
 * Paths without a recognised locale prefix are always allowed (the
 * locale guard in proxy.ts will add the prefix first).
 *
 * The redirect carries the blocked destination as a validated `?next=` so the
 * viewer resumes the task they were actually trying to reach. Before this the
 * gate discarded it, so every gated deep link landed on a bare sign-in page and
 * stranded the viewer one level above wherever they meant to go.
 *
 * @param pathname  The full request pathname (e.g. "/en/creator/settings")
 * @param hasSession  Whether a valid Supabase session exists for this request
 * @param search  The request's query string including "?", preserved into `next`
 */
export function gateDecision(
  pathname: string,
  hasSession: boolean,
  search = '',
): GateDecision {
  // Parse locale from the first path segment.
  const parts = pathname.split('/')  // ['', 'en', 'creator', ...]
  const maybeLocale = parts[1] ?? ''

  // Only gate paths that start with a known locale.
  if (!(LOCALES as readonly string[]).includes(maybeLocale)) {
    return { type: 'allow' }
  }

  const rest = parts.slice(2).join('/')  // 'creator' | 'creator/settings' | 'articles' | ...

  const gatedPrefixes = [
    'creator',
    'creator/',
    'merchants/dashboard',
    'studio/missions',
    'ops/settlements',
    'admin',
    'trips',
    'trips/',
  ]
  const needsAuth = gatedPrefixes.some((prefix) =>
    rest === prefix || rest.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`),
  )

  if (needsAuth) {
    if (hasSession) return { type: 'allow' }
    return {
      type: 'redirect',
      location: signInHref(maybeLocale, `${pathname}${search}`),
    }
  }

  return { type: 'allow' }
}
