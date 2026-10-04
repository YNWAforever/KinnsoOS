// Test stub for the `server-only` package. It is a Next.js runtime marker that is
// intentionally NOT installed in this workspace (see lib/missions/travelpayouts.ts),
// so Vite cannot resolve the bare `import 'server-only'` specifier during test
// transforms. vitest.config.ts aliases `server-only` to this empty module so any
// test that transitively imports a server-only file (e.g. the offers page host
// test) loads cleanly. No-op at runtime.
export {}
