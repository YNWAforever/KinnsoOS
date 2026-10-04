import { describe, it, expect } from 'vitest'
import { listAllPerks } from '@/lib/admin/perks-queries'

function client(rows: unknown[] | null, error: unknown = null) {
  const builder = {
    select: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: rows, error }),
  }
  return { from: () => builder }
}

describe('listAllPerks', () => {
  it('returns all perk rows (chained order, ops RLS read)', async () => {
    const rows = [{ id: 'p1', title: 'A', redemption_value: 'SECRET' }]
    const out = await listAllPerks(client(rows) as never)
    expect(out).toEqual(rows)
  })
  it('throws when the query errors (no silent empty list)', async () => {
    await expect(listAllPerks(client(null, { message: 'boom' }) as never)).rejects.toBeTruthy()
  })
})
