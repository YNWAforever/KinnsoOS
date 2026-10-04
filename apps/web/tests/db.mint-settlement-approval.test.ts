import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_mint_settlement_on_approval.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.1 approval settlement minting trigger', () => {
  it('applies after the unique indexes', () => {
    expect(matches[0] > '20260815100000').toBe(true)
  })

  it('is a security definer trigger function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_approval()')
    expect(sql).toContain('returns trigger')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('fires only on approval and not on re-approval', () => {
    expect(sql).toContain("if new.status <> 'approved' then return new; end if")
    expect(sql).toContain("if tg_op = 'update' and coalesce(old.status, '') = 'approved' then return new; end if")
  })

  it('reaches mission_id through mission_participants, which the submission does not carry', () => {
    expect(sql).toContain('from public.mission_participants mp')
    expect(sql).toContain('join public.missions m on m.id = mp.mission_id')
    expect(sql).toContain('where mp.id = new.mission_participant_id')
  })

  it('mints only for merchant paid or hybrid missions with a real fee', () => {
    expect(sql).toContain("v_source <> 'merchant'")
    expect(sql).toContain("v_mission_type not in ('paid','hybrid')")
    expect(sql).toContain('v_fee is null or v_fee <= 0')
  })

  it('is idempotent against the participant-scoped partial index, repeating its predicate', () => {
    expect(sql).toContain('on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null do nothing')
  })

  it('never calls the ops audit helper, which would reject the merchant actor', () => {
    expect(sql).not.toContain('ops_audit_log_append')
  })

  it('records an obligation, never a payment', () => {
    expect(sql).toContain("'pending'")
  })

  it('revokes execute from every client role', () => {
    expect(sql).toContain('revoke all on function public.create_mission_settlement_on_approval() from public, anon, authenticated, service_role')
  })
})
