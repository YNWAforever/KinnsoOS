import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_settlement_mint_uniques.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.1 settlement mint unique indexes', () => {
  it('sorts after the r10.0 migration', () => {
    expect(matches[0] > '20260815090000').toBe(true)
  })

  it('creates a partial unique index keyed on the affiliate event', () => {
    expect(sql).toContain('create unique index if not exists mission_settlements_affiliate_event_uniq')
    expect(sql).toContain('on public.mission_settlements (affiliate_network_event_id)')
    expect(sql).toContain('where affiliate_network_event_id is not null')
  })

  it('creates a partial unique index keyed on the participant for fee settlements', () => {
    expect(sql).toContain('create unique index if not exists mission_settlements_participant_fee_uniq')
    expect(sql).toContain('on public.mission_settlements (mission_participant_id)')
    expect(sql).toContain('where affiliate_network_event_id is null and mission_participant_id is not null')
  })

  it('fails loudly on pre-existing duplicates instead of silently dropping rows', () => {
    expect(sql).toContain('raise exception')
    expect(sql).not.toContain('delete from public.mission_settlements')
  })

  it('does not drop the existing non-unique index', () => {
    expect(sql).not.toContain('drop index mission_settlements_affiliate_event_idx')
  })
})
