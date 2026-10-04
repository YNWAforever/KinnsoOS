// apps/web/tests/db.r10-1-deploy-settlement-minting.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821110000_r10_1_deploy_settlement_minting.sql'),
  'utf8',
)

describe('R10.1 settlement-minting deployment (never applied to production until now)', () => {
  it('pre-checks for duplicate rows before creating either unique index', () => {
    expect(sql).toContain("group by affiliate_network_event_id having count(*) > 1")
    expect(sql).toContain("group by mission_participant_id having count(*) > 1")
  })

  it('creates the affiliate-event unique index unchanged from the original R10.1 migration', () => {
    expect(sql).toContain(
      'create unique index if not exists mission_settlements_affiliate_event_uniq\n' +
      '  on public.mission_settlements (affiliate_network_event_id)\n' +
      '  where affiliate_network_event_id is not null;',
    )
  })

  it('scopes the mission-fee unique index to source = mission_fee, unlike the original R10.1 file', () => {
    expect(sql).toContain(
      "where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee';",
    )
  })

  it('deploys the affiliate-conversion trigger on affiliate_network_events', () => {
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_affiliate_paid()')
    expect(sql).toContain('create trigger mission_settlement_on_affiliate_paid')
    expect(sql).toContain('after insert or update on public.affiliate_network_events')
  })

  it('deploys the mission-fee approval trigger on mission_milestone_submissions', () => {
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_approval()')
    expect(sql).toContain('create trigger mission_settlement_on_approval')
    expect(sql).toContain('after insert or update on public.mission_milestone_submissions')
  })

  it("the approval trigger's ON CONFLICT clause matches the source-scoped index exactly", () => {
    expect(sql).toContain(
      "on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'",
    )
  })

  it('revokes default privileges from both trigger functions (Supabase auto-grant defense)', () => {
    const revokeCount = (sql.match(/revoke all on function public\.create_mission_settlement/g) ?? []).length
    expect(revokeCount).toBe(2)
  })
})
