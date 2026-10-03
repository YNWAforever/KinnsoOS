import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

/**
 * Service-role Supabase client — bypasses RLS entirely. Five documented
 * exceptions are permitted to use this: the Stripe webhook (design spec §4.5),
 * the Travelpayouts cron sync route (`app/api/cron/travelpayouts-sync`,
 * D-R3-9), the analytics retention cron route
 * (`app/api/cron/traveller-analytics-retention`), and the session waitlist
 * server action. The waitlist action uses
 * this client only for its final append after its honeypot and IP rate-limit
 * checks have succeeded; and the analytics ingestion route, only after strict
 * schema validation, the 15-minute timestamp bound, and journey throttle have
 * succeeded. Analytics writes are a flat, server-derived ledger upsert; this
 * client is never exposed to the browser. All are narrow, auditable server-side
 * writes. No other request path in this codebase may import this file.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient<Database>(url!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
