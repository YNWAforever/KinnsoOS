import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_backfill_affiliate_settlements.sql'))
expect(matches).toHaveLength(1)
const raw = readFileSync(join(dir, matches[0]), 'utf8')
const sql = raw.toLowerCase().replaceAll(/\s+/gu, ' ')

// Negative assertions run against comment-stripped SQL. A migration's comments explain what
// it deliberately does NOT do, so naming those things is correct documentation — but a bare
// substring check would read the explanation as the offence and fail on well-commented SQL.
const sqlNoComments = raw
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join(' ')
  .toLowerCase()
  .replaceAll(/\s+/gu, ' ')

describe('r10.1 affiliate settlement backfill', () => {
  it('applies after both minting triggers', () => {
    expect(matches[0] > '20260815100200').toBe(true)
  })

  it('mints only fully attributed paid events with a positive amount and a real rate', () => {
    expect(sql).toContain("ev.event_state = 'paid'")
    expect(sql).toContain('ev.mission_id is not null')
    expect(sql).toContain('ev.mission_participant_id is not null')
    expect(sql).toContain('ev.creator_id is not null')
    expect(sql).toContain('coalesce(ev.profit_amount, 0) > 0')
    expect(sql).toContain('m.creator_commission_rate > 0')
  })

  it('re-runs safely against the same partial unique index', () => {
    expect(sql).toContain('on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null do nothing')
  })

  it('uses the same percentage math as the trigger', () => {
    expect(sql).toContain('/ 100.0')
  })

  it('never updates or deletes an existing settlement', () => {
    expect(sqlNoComments).not.toContain('update public.mission_settlements')
    expect(sqlNoComments).not.toContain('delete from public.mission_settlements')
  })

  it('does not backfill mission-fee settlements', () => {
    expect(sqlNoComments).not.toContain('mission_milestone_submissions')
  })
})
