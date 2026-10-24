import base from './vitest.config'

// Explicit offline selection only. Replace (do not merge) the connected setup,
// which loads .env.test and therefore must not run without target attestation.
const offlineConfig = {
  ...base,
  test: {
    ...base.test,
    maxWorkers: 1,
    setupFiles: ['./vitest.offline.setup.ts'],
  },
}

export default offlineConfig
