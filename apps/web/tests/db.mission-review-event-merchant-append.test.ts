import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_0_mission_review_event_merchant_append.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.0 mission_review_event_append RPC', () => {
  it('applies after admin_review_submission and before the analytics-widening migration', () => {
    expect(matches[0] > '20260819090100').toBe(true)
    expect(matches[0] < '20260819090200').toBe(true)
  })

  it('is the only insert path onto mission_review_events for a client role (table has no direct grant)', () => {
    const eventsMigration = readFileSync(
      join(dir, readdirSync(dir).find((f) => f.endsWith('_r11_0_mission_review_events.sql')) as string),
      'utf8',
    ).toLowerCase()
    expect(eventsMigration).toContain('revoke all on public.mission_review_events from public, anon, authenticated')
    expect(eventsMigration).not.toContain('grant insert on public.mission_review_events')
  })

  it('creates a security definer function', () => {
    expect(sql).toContain('create or replace function public.mission_review_event_append(')
    expect(sql).toContain('security definer')
  })

  it('gates on the caller owning the mission via mission_participants -> missions -> merchant_profiles, mirroring mission_review_events_select\'s own merchant join', () => {
    expect(sql).toContain(
      'from public.mission_milestone_submissions sub ' +
      'join public.mission_participants p on p.id = sub.mission_participant_id ' +
      'join public.missions m on m.id = p.mission_id ' +
      'join public.merchant_profiles mp on mp.id = m.merchant_profile_id ' +
      'where sub.id = p_submission_id and mp.user_id = auth.uid()',
    )
    expect(sql).toContain("if not v_is_owner then raise exception 'forbidden' using errcode = '42501'; end if;")
  })

  it('rejects an unknown action before writing', () => {
    expect(sql).toContain("if p_action not in ('approve', 'reject', 'request_revision') then raise exception 'bad_action'; end if;")
  })

  it('inserts exactly one merchant-actor review event with no reason_category', () => {
    expect(sql).toContain(
      "insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text) " +
      "values (p_submission_id, 'merchant', auth.uid(), p_action, null, p_reason_text);",
    )
  })

  it('never touches mission_milestone_submissions.status -- reviewSubmissionAction owns that CAS update directly', () => {
    expect(sql).not.toContain('update public.mission_milestone_submissions')
  })

  it('revokes from every client role except an authenticated grant', () => {
    expect(sql).toContain('revoke all on function public.mission_review_event_append(uuid, text, text) from public, anon')
    expect(sql).toContain('grant execute on function public.mission_review_event_append(uuid, text, text) to authenticated')
  })
})
