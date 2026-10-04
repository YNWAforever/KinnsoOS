import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_mint_settlement_from_affiliate_event.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.1 affiliate settlement minting trigger', () => {
  it('applies after the unique indexes it depends on', () => {
    expect(matches[0] > '20260815100000').toBe(true)
  })

  it('is a security definer trigger function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_affiliate_paid()')
    expect(sql).toContain('returns trigger')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('fires on insert and update, not only on insert', () => {
    expect(sql).toContain('after insert or update on public.affiliate_network_events')
  })

  it('mints only for a fully attributed paid event', () => {
    expect(sql).toContain("if new.event_state <> 'paid' then return new; end if")
    expect(sql).toContain('new.mission_id is null or new.mission_participant_id is null or new.creator_id is null')
  })

  it('does not re-mint when an already-paid event is updated again', () => {
    expect(sql).toContain("if tg_op = 'update' and old.event_state = 'paid' then return new; end if")
  })

  it('treats commission rates as percentages', () => {
    expect(sql).toContain('/ 100.0')
  })

  it('refuses to invent a rate where the mission has none', () => {
    expect(sql).toContain('v_creator_rate is null or v_creator_rate <= 0')
  })

  it('is idempotent against the partial unique index, repeating its predicate', () => {
    expect(sql).toContain('on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null do nothing')
  })

  it('records an obligation, never a payment', () => {
    expect(sql).toContain("'pending'")
    expect(sql).not.toContain("creator_payout_status, 'paid'")
  })

  it('writes the settlement currency column, not the bookings one', () => {
    expect(sql).toContain('amount_currency')
  })

  it('revokes execute from every client role', () => {
    expect(sql).toContain('revoke all on function public.create_mission_settlement_on_affiliate_paid() from public, anon, authenticated, service_role')
  })
})
