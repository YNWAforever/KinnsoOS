import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resolve the "@/..." alias the same way tsconfig does (paths: { "@/*": ["./*"] }),
// so tests can import app modules (e.g. "@/lib/articles/queries").
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      // `server-only` is a Next.js runtime marker not installed in this workspace;
      // alias it to an empty stub so tests that transitively import a server-only
      // module (e.g. the offers page → lib/missions/travelpayouts.ts) resolve.
      'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    maxWorkers: process.env.KINNSO_TEST_TARGET === 'local' ? 1 : undefined,
    environment: 'node',
    // Node 22+ ships an experimental native `globalThis.localStorage`, on by default in
    // this Node version, backed by nothing until `--localstorage-file=<path>` is set — it
    // exists as an empty, prototype-less object (`typeof localStorage === 'object'` but
    // `.clear`/`.getItem`/etc are all `undefined`). It's defined before vitest's jsdom
    // environment ever runs, so jsdom's own fully-functional `window.localStorage` never
    // gets attached to the worker's global scope — Node's stub wins the name and every
    // `@vitest-environment jsdom` test calling `localStorage.clear()` throws `TypeError:
    // localStorage.clear is not a function`. Disabling the flag for test workers removes
    // Node's stub entirely, letting jsdom provide the real thing. Confirmed via direct
    // reproduction (`node -e` with and without this flag) before applying here — this
    // is not a jsdom bug, and jsdom's own localStorage works correctly once Node's own
    // stub is out of the way.
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
