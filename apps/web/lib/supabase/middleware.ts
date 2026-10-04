import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@kinnso/db'
import type { User } from '@supabase/supabase-js'

/**
 * Canonical @supabase/ssr request/response cookie bridge for use in proxy.ts
 * (Next 16 middleware layer, where next/headers cookies() is unavailable).
 *
 * Creates a Supabase server client that reads cookies from the incoming
 * NextRequest and writes refreshed session cookies onto the NextResponse.
 * Returns both the response (to be passed to NextResponse.next() callers)
 * and the authenticated user (or null).
 *
 * Call this at the TOP of proxy.ts before any redirect logic so that the
 * session cookie is always refreshed.
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse & { user: User | null }> {
  // Start with a plain next-response; we will attach cookies from Supabase onto it.
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Write onto the request first (for downstream middleware reads),
          // then onto the response (so the browser gets the refreshed cookie).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: always call getUser() — do NOT use getSession().
  // getSession() reads from the cookie without re-validating with the server.
  // getUser() validates the JWT with Supabase Auth every time (required for security).
  const { data: { user } } = await supabase.auth.getUser()

  // Attach user to the response object so proxy.ts can use it for gating
  // without making a second network call.
  ;(response as NextResponse & { user: User | null }).user = user ?? null

  return response as NextResponse & { user: User | null }
}
