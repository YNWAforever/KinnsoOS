// apps/web/tests/db.r12-0-settlement-on-redemption.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql'),
  'utf8',
)

describe('settlement-on-redemption trigger', () => {
  it('adds a source column to mission_settlements defaulting to mission_fee', () => {
    expect(sql).toContain("add column source text not null default 'mission_fee' check (source in ('mission_fee', 'visit_redemption'))")
  })

  it('fires AFTER INSERT on offer_redemptions', () => {
    expect(sql).toContain('after insert on public.offer_redemptions')
  })

  it('no-ops when the offer has no mission context', () => {
    expect(sql).toContain('if v_mission_id is null then\n    return new;\n  end if;')
  })

  it('no-ops when the creator has no mission_participants row', () => {
    expect(sql).toContain('if v_participant_id is null then\n    return new;\n  end if;')
  })

  it('computes the fee from commission_kind, flat or percent of amount_spent', () => {
    expect(sql).toContain("when v_commission_kind = 'flat' then v_commission_value")
    expect(sql).toContain('round(coalesce(new.amount_spent, 0) * v_commission_value / 100, 2)')
  })

  it('inserts with source visit_redemption and status not_started', () => {
    expect(sql).toContain("'not_started', 'visit_redemption'")
  })

  it('writes the settlement id back onto the redemption row', () => {
    expect(sql).toContain('update public.offer_redemptions set settlement_id = v_settlement_id where id = new.id')
  })

  it('narrows the R10.1 participant-fee unique index to mission_fee only, so visit_redemption rows are unconstrained', () => {
    expect(sql).toContain('drop index public.mission_settlements_participant_fee_uniq')
    expect(sql).toContain("where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'")
  })

  it('compensates R10.1\'s mint-on-approval trigger so its ON CONFLICT arbiter still matches the narrowed index', () => {
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_approval()')
    expect(sql).toContain("on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'")
  })
})
