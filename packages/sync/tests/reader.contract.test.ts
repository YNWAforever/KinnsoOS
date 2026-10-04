import { describe, it, expect } from 'vitest'
import { LegacyReader } from '../src/reader'
import { loadConfig } from '../src/config'

const run = process.env.LEGACY_DB_HOST ? describe : describe.skip
run('LegacyReader (live)', () => {
  it('fetches a bundle for the first post id', async () => {
    const cfg = loadConfig()
    const reader = new LegacyReader(cfg.legacy)
    const [id] = await reader.allPostIds(0, 1)
    const bundle = await reader.fetchPostBundle(id)
    expect(bundle?.post.id).toBe(id)
    await reader.close()
  })
})
