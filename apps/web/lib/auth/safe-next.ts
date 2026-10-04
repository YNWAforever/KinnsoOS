import { LOCALES } from '@/lib/i18n/config'

/**
 * Validate a `?next=` destination before redirecting a freshly signed-in user
 * to it.
 *
 * The parameter is fully attacker-controllable, so anything that is not
 * provably a path on this site is discarded rather than sanitised: a login page
 * that forwards to an arbitrary destination is an open redirect, and a
 * convincing one, because the victim really did just authenticate.
 *
 * Rejected: absolute URLs (`https://evil.test`), scheme-relative URLs
 * (`//evil.test`, plus the backslash variants some clients normalise to `/`),
 * anything not starting with a single `/`, and control characters that could
 * split a Location header. Accepted: a path under the caller's own locale.
 */
export function safeNext(next: string | undefined, locale: string): string | null {
  if (!next) return null

  let value = next.trim()
  if (!value) return null

  // A caller may hand us a raw or an encoded value; decode once so both shapes
  // are checked. A malformed escape means we cannot reason about it at all.
  try {
    value = decodeURIComponent(value)
  } catch {
    return null
  }

  // Control characters — CR/LF above all — could split a Location header.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return null
  }

  // Normalise backslashes first: several clients read "/\evil.test" as
  // scheme-relative, so it must not survive the "//" check below.
  if (value.includes('\\')) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null

  // Must address the caller's own locale, so `next` can never leave the app.
  const segment = value.split('/')[1] ?? ''
  if (!(LOCALES as readonly string[]).includes(segment)) return null
  if (segment !== locale) return null

  return value
}
