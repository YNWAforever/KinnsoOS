import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

for (const name of Object.keys(process.env)) {
  if (/SUPABASE|DATABASE_URL|OPENAI|ANTHROPIC|STRIPE.*KEY/.test(name)) delete process.env[name]
}
globalThis.fetch = async () => { throw new Error('OFFLINE_NETWORK_BLOCKED') }
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('OFFLINE_REAL_CLIENT_BLOCKED') },
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => { throw new Error('OFFLINE_REAL_CLIENT_BLOCKED') },
  createBrowserClient: () => { throw new Error('OFFLINE_REAL_CLIENT_BLOCKED') },
}))
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
