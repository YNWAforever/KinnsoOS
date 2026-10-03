import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@kinnso/db'

type SupabaseServerClientOptions = {
  global?: { headers?: Record<string, string> }
}

/**
 * Supabase client for Server Components / Route Handlers.
 * Next 15+ `cookies()` is async, so this helper is async too.
 */
export async function createSupabaseServerClient(options?: SupabaseServerClientOptions) {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      ...(options?.global ? { global: options.global } : {}),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component; safe to ignore when middleware
            // is responsible for refreshing sessions.
          }
        },
      },
    },
  )
}
