import {defineConfig} from 'vitest/config'
/** Pure unit tests only: no .env loader, Supabase setup or network fixtures. */
export default defineConfig({test:{environment:'node',include:['tests/uncached-public-fetch.test.ts'],maxWorkers:1}})
