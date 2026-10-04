import { config } from 'dotenv'
import '@testing-library/jest-dom/vitest'

// recharts' ResponsiveContainer (EngagementTrendChart) observes its box via
// ResizeObserver, which jsdom does not implement. Provide a no-op so chart
// components render in component tests instead of throwing ReferenceError.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// react-simple-maps (WorldHeatmap) eagerly fetches the relative TopoJSON URL
// `/world-110m.json` on render. In jsdom that relative URL has no origin, so
// the fetch rejects with ERR_INVALID_URL and surfaces as an unhandled rejection
// that fails any component test rendering a map. Intercept only that exact geo
// URL — returning an empty topology so `Geographies` renders zero shapes — and
// delegate every other request to the real fetch (supabase integration tests).
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url === '/world-110m.json') {
    // Minimal-but-valid TopoJSON: one named object that topojson-client.feature
    // resolves to an empty FeatureCollection — no shapes, no parser crash.
    const topology = {
      type: 'Topology',
      arcs: [],
      objects: {
        countries: { type: 'GeometryCollection', geometries: [] },
      },
    }
    return Promise.resolve(
      new Response(JSON.stringify(topology), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  return realFetch(input, init)
}) as typeof fetch

// Load test env (created locally from the hosted project, or in CI from
// `supabase status`). See README / CI for the required keys:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
config({ path: '.env.test' })

if (!process.env.SUPABASE_URL) {
  throw new Error('Set apps/web/.env.test (SUPABASE_URL etc.) before running integration tests')
}
