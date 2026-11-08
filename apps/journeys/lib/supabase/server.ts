import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { backendTarget,capabilities } from '../contracts/capabilities';
import {discoveryDomainTransport} from '../discovery/domain-transport';

export async function serverClient() {
  const target = backendTarget(process.env);
  if (!target) return null;
  const jar = await cookies();
  return createServerClient(target.origin, target.key, {global:{fetch:discoveryDomainTransport({enabled:()=>capabilities(process.env).matchedBriefHandoff?.mode==='connected'})}, cookies: {
    getAll: () => jar.getAll(),
    setAll: (values) => {
      try { for (const { name, value, options } of values) jar.set(name, value, options); }
      catch { /* Server Components cannot set cookies; proxy refreshes them. */ }
    },
  } });
}
