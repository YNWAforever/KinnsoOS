import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/scan.integration.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    env: { KINNSO_RUN_WORKER_DB_TESTS: '1' },
  },
})
