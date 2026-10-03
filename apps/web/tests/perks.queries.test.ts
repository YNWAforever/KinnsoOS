import { describe, it, expect } from 'vitest'
import { listActivePerks, listRedeemedPerkIds } from '@/lib/perks/queries'

describe('listActivePerks', () => {
  it('calls the list_active_perks RPC and returns rows', async () => {
    const rows = [{ id: 'p1', slug: 'k', title: 'K' }]
    const client = { rpc: async () => ({ data: rows, error: null }) }
    expect(await listActivePerks(client as never)).toEqual(rows)
  })
  it('throws on RPC error', async () => {
    const client = { rpc: async () => ({ data: null, error: { message: 'x' } }) }
    await expect(listActivePerks(client as never)).rejects.toBeTruthy()
  })
})

describe('listRedeemedPerkIds', () => {
  it('returns the perk ids the creator redeemed', async () => {
    const builder = { select: () => builder, eq: async () => ({ data: [{ perk_id: 'p1' }, { perk_id: 'p2' }], error: null }) }
    const client = { from: () => builder }
    expect(await listRedeemedPerkIds(client as never, 'c1')).toEqual(['p1', 'p2'])
  })
})
