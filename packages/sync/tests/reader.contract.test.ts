import { describe, it, expect } from 'vitest'
import { LegacyReader } from '../src/reader'
import { requireWorkerSupabaseTarget, requireSyntheticMysqlTarget } from '../../../scripts/worker-test-target.mjs'

const target = requireWorkerSupabaseTarget()
const legacy = requireSyntheticMysqlTarget(process.env, target)
describe('LegacyReader (attested synthetic local fixture)', () => {
  it('fetches a bundle for the first post id', async () => {
    const reader = new LegacyReader(legacy)
    try {
      const [id] = await reader.allPostIds(0, 1)
      const bundle = await reader.fetchPostBundle(id)
      expect(bundle?.post.id).toBe(id)
    } finally {
      await reader.close()
    }
  })
})
