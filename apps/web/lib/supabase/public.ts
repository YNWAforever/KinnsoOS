import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { getSupabasePublicEnv } from '@/lib/env'
import { uncachedPublicFetch } from './uncached-public-fetch'

/**
 * Cookie-less anon Supabase client for PUBLIC reads (published guides etc.).
 * No cookies are sent. Rights-sensitive rows must be checked on each request,
 * including home, search, sitemap and OG callers; no shared response cache.
 */
export function createSupabasePublicClient() {
  const { url, anonKey } = getSupabasePublicEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: uncachedPublicFetch() },
  })
}
