// apps/web/tests/missions.offer-catalog-parity.test.ts
// NOTE: ESM + vitest — there is no CommonJS `__dirname`; derive it from import.meta.url
// (matches the existing pattern in tests/mission.actions.test.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OFFER_CATALOG } from '@/lib/missions/offer-catalog'

// test dir = kinnso-v3/apps/web/tests → three `..` reaches kinnso-v3, then supabase/migrations.
const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(HERE, '..', '..', '..', 'supabase', 'migrations')

function readSeedMigration(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith('_seed_travelpayouts_offers.sql'))
  if (!file) throw new Error('seed migration not found')
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
}

describe('offer catalog ↔ seed migration parity', () => {
  const sql = readSeedMigration()

  it('mentions every catalog external program id', () => {
    for (const e of OFFER_CATALOG) {
      expect(sql).toContain(`'${e.externalProgramId}'`)
    }
  })

  it('mentions every catalog program url', () => {
    for (const e of OFFER_CATALOG) {
      expect(sql).toContain(e.programUrl)
    }
  })

  it('inserts exactly the catalog count of programs (no stray external ids)', () => {
    const matches = sql.match(/'tp-[a-z0-9-]+'/g) ?? []
    const unique = new Set(matches.map((m) => m.replace(/'/g, '')))
    expect(unique.size).toBe(OFFER_CATALOG.length)
  })
})
