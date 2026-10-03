import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { backendTarget } from '../contracts/capabilities';

export async function serverClient() {
  const target = backendTarget(process.env);
  if (!target) return null;
  const jar = await cookies();
  return createServerClient(target.origin, target.key, { cookies: {
    getAll: () => jar.getAll(),
    setAll: (values) => {
      try { for (const { name, value, options } of values) jar.set(name, value, options); }
      catch { /* Server Components cannot set cookies; proxy refreshes them. */ }
    },
  } });
}
