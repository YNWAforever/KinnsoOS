import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { getSupabasePublicEnv } from '@/lib/env'

/**
 * Cookie-less anon Supabase client for PUBLIC reads (published guides etc.).
 * Using this instead of the cookie-bound server client keeps RSC routes that
 * only read public data statically optimizable (no `cookies()` => no forced
 * dynamic rendering).
 */
export function createSupabasePublicClient() {
  const { url, anonKey } = getSupabasePublicEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
