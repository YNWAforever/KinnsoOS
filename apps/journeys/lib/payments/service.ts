/** Server-only Supabase client for provider callbacks.
 *
 * Webhooks carry no traveller session, so ingestion runs as the service role and the
 * database RPC is granted only to that role. The client is built per request and never
 * exported to a browser bundle.
 */
import { createClient } from '@supabase/supabase-js';
import { emailServiceKey } from '../email/provider';

export function paymentsServiceClient(env: Record<string, string | undefined> = process.env) {
  const origin = env.KINNSO_SUPABASE_URL ?? '';
  const key = emailServiceKey(env);
  if (!origin || !key) return null;
  return createClient(origin, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
