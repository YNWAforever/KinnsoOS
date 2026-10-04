import { safeNext } from './safe-next'

/**
 * Build the sign-in URL for a viewer who was interrupted mid-task.
 *
 * This is the *producer* half of the `?next=` contract whose *consumer* half is
 * `safeNext` (read by `app/[locale]/sign-in/page.tsx`). Keeping the two halves
 * paired matters: a producer that emits a destination the consumer will later
 * reject sends the viewer to a dead end that looks like a bug but reads like a
 * security control.
 *
 * The rule here is therefore deliberately strict — **only emit what will
 * survive the read.** Every candidate is run through `safeNext` itself, so the
 * producer can never disagree with the consumer about what counts as in-app.
 *
 * Anything rejected degrades to the bare sign-in page. A viewer who lands on a
 * generic sign-in is mildly inconvenienced; a viewer forwarded to an
 * attacker-chosen destination immediately after authenticating is phished.
 *
 * @param locale   The caller's locale segment; `returnTo` must live under it.
 * @param returnTo An in-app path, normally `location.pathname + location.search`.
 */
export function signInHref(locale: string, returnTo?: string | null): string {
  const base = `/${locale}/sign-in`

  const validated = safeNext(returnTo ?? undefined, locale)
  if (!validated) return base

  // `safeNext` decodes its input once before validating, and the sign-in page
  // reads `next` from Next's `searchParams`, which has *already* been decoded.
  // A destination containing a literal percent sign would therefore be decoded
  // twice on the way back and arrive corrupted (`?q=100%25` -> `?q=100%`).
  // Rather than reflect a subtly wrong URL, drop the destination unless the
  // round trip is provably lossless. This is the rare case: ordinary guide,
  // experience and explore URLs are decode-stable.
  let decodeStable: boolean
  try {
    decodeStable = decodeURIComponent(validated) === validated
  } catch {
    decodeStable = false
  }
  if (!decodeStable) return base

  return `${base}?next=${encodeURIComponent(validated)}`
}

/**
 * The current in-app location as a `?next=` candidate, for use inside a browser
 * event handler.
 *
 * Read at click time from `window.location` rather than through
 * `useSearchParams()` on purpose: the guide, experience and explore routes are
 * prerendered, and calling `useSearchParams` in a Client Component forces the
 * tree up to the nearest `<Suspense>` boundary to be client-side rendered
 * instead (Next.js 16, `useSearchParams` → Prerendering). A click handler needs
 * no hook and costs the prerender nothing.
 *
 * Returns `undefined` when there is no DOM (server render, or a component test
 * running outside jsdom); `signInHref` degrades that to the bare sign-in page.
 */
export function currentReturnPath(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const { pathname, search } = window.location
  if (!pathname) return undefined
  return `${pathname}${search}`
}
