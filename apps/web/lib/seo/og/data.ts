/** Truncate to `max` chars, appending an ellipsis (counted within `max`). */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

/** First `max` niches for the OG chip row. */
export function pickNiches(niches: string[], max = 3): string[] {
  return niches.slice(0, max)
}

/**
 * Returns a creator-supplied image URL only if it is safe to fetch server-side
 * from the OG route — must be https and NOT an internal/loopback/link-local host.
 * Blind-SSRF hardening: the guide OG card renders `<img src>` which satori (or our
 * own `loadRemoteImage` fetch) pulls on the server. Anything rejected falls back to
 * the brand-color backdrop.
 *
 * Note: this is a best-effort host allowlist; it cannot defend against DNS rebinding
 * (a public hostname resolving to an internal address) — pair it with `loadRemoteImage`,
 * which fetches with `redirect: 'error'` and a timeout, and ultimately an egress
 * allowlist for true protection.
 */
export function safeImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:') return undefined

  // WHATWG URL returns IPv6 literals bracketed (e.g. "[::1]"); strip the brackets
  // so the matching below sees the bare address.
  const raw = u.hostname.toLowerCase()
  const host = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw

  if (host === 'localhost' || host.endsWith('.local')) return undefined

  // Any IPv6 literal (its presence is unambiguous: a bare `:` only ever appears in
  // an IPv6 host). No legitimate cover CDN is addressed by a raw IPv6 literal, and
  // per-range classification is error-prone, so reject them all — this closes the
  // previous bypass where `[::1]`, ULA `fc00::/7`, link-local `fe80::/10`, the
  // unspecified `::`, and IPv4-mapped `::ffff:127.0.0.1` all slipped through.
  if (host.includes(':')) return undefined

  // IPv4 internal ranges. Node normalises integer/hex/octal encodings to dotted-quad
  // before we see them, so these regexes also catch e.g. `https://2130706433/`.
  if (/^127\./.test(host)) return undefined // loopback
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return undefined // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return undefined // private 172.16-31
  if (/^169\.254\./.test(host)) return undefined // link-local + cloud metadata
  if (/^0\./.test(host)) return undefined
  return u.toString()
}

/**
 * Fetches a creator-supplied image server-side and returns it as a `data:` URI so the
 * OG renderer never performs its own network fetch — that fetch is otherwise uncatchable
 * (it happens while the response streams) and un-timeout-able, so a slow/404/non-image
 * cover would 500 the whole OG route instead of degrading to the backdrop.
 *
 * Hardening: runs the URL through `safeImageUrl`, refuses redirects (`redirect: 'error'`
 * blocks an allowed host bouncing to an internal one), enforces a hard timeout, requires
 * an `image/*` content-type, and caps the body size. Returns undefined on any failure.
 */
export async function loadRemoteImage(url: string | null | undefined): Promise<string | undefined> {
  const safe = safeImageUrl(url)
  if (!safe) return undefined
  try {
    const res = await fetch(safe, { redirect: 'error', signal: AbortSignal.timeout(3000) })
    if (!res.ok) return undefined
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 5_000_000) return undefined // 5 MB cap
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}
