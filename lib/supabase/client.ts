import { createBrowserClient } from '@supabase/ssr';
export function browserClient(origin: string, publishableKey: string) {
  return createBrowserClient(origin, publishableKey);
}
