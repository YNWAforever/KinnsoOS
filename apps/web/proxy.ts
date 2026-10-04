import { NextRequest, NextResponse } from 'next/server'
import { resolveRequest } from '@/lib/redirects/resolve'
import { updateSession } from '@/lib/supabase/middleware'
import { gateDecision } from '@/lib/auth/gate'

// Module-level cache of the locale-agnostic seo_redirects map (cold-isolate refresh).
let cache: { map: Map<string, string>; at: number } | null = null
const TTL_MS = 60 * 60 * 1000 // 1h

async function getRedirects(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  const map = new Map<string, string>()
  if (base && key) {
    try {
      const res = await fetch(`${base}/rest/v1/seo_redirects?select=from_path,to_path`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(2500), // bound edge latency; on timeout we fall back to locale-guard only
      })
      if (res.ok) for (const r of (await res.json()) as Array<{ from_path: string; to_path: string }>) {
        map.set(r.from_path, r.to_path)
      }
    } catch { /* non-fatal: fall back to locale-guard only */ }
  }
  cache = { map, at: Date.now() }
  return map
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1. Refresh the Supabase session cookie on every request.
  //    updateSession also returns the current user so we avoid a second DB call.
  const sessionResponse = await updateSession(req)
  const user = sessionResponse.user

  // 2. Auth gate — must run BEFORE the locale guard so that
  //    /en/creator (already locale-prefixed) is caught here.
  const gate = gateDecision(pathname, user !== null, req.nextUrl.search)
  if (gate.type === 'redirect') {
    // gate.location is a path *plus* an encoded `?next=`, so it is resolved as a
    // relative URL rather than assigned to `url.pathname` — assigning a string
    // containing "?" to pathname would percent-escape it into a 404 path.
    // The original query is not dropped here; it is carried inside `next`.
    const url = new URL(gate.location, req.nextUrl)
    const res = NextResponse.redirect(url, 307)
    // Copy the refreshed Supabase auth cookies from updateSession onto the
    // redirect response. @supabase/ssr middleware requires these Set-Cookie
    // headers to propagate or the rotated refresh token is lost (silent logout).
    sessionResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  // 3. Existing redirect + locale-guard logic (unchanged).
  const decision = resolveRequest(pathname, await getRedirects())
  if (decision.type === 'redirect') {
    const url = req.nextUrl.clone()
    url.pathname = decision.location
    url.search = decision.status === 301 ? '' : req.nextUrl.search
    const res = NextResponse.redirect(url, decision.status)
    // Same as above: preserve refreshed Supabase auth cookies across the
    // locale/SEO redirect so @supabase/ssr can rotate the session correctly.
    sessionResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  // 4. Pass through, returning the session response so Set-Cookie headers
  //    (refreshed session tokens) propagate to the browser.
  return sessionResponse
}

export const config = {
  // Skip api, next internals, metadata files, and anything with a file extension.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
}
