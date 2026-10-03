import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_1_auto_approve_policy.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.1 auto_approve_policy column, trigger, and setter RPC', () => {
  it('adds the column, defaulted off, constrained to the two known values', () => {
    expect(sql).toContain('alter table public.missions')
    expect(sql).toContain("add column auto_approve_policy text not null default 'off' check (auto_approve_policy in ('off', 'verified_signal_only'))")
  })

  it('the trigger only fires on the transition into ready + verified_signal', () => {
    expect(sql).toContain("if new.status = 'ready' and new.confidence_status = 'verified_signal'")
    expect(sql).toContain('and (old.status, old.confidence_status) is distinct from (new.status, new.confidence_status) then')
  })

  it('the trigger is a SECURITY DEFINER function fired AFTER UPDATE on mission_verification_jobs', () => {
    expect(sql).toContain('create or replace function public.notify_verification_auto_approve() returns trigger')
    expect(sql).toContain('language plpgsql security definer set search_path = public')
    expect(sql).toContain('create trigger notify_verification_auto_approve_trg')
    expect(sql).toContain('after update on public.mission_verification_jobs')
  })

  it('never gates on is_active_ops_role -- there is no human caller in a trigger', () => {
    expect(sql).not.toContain('notify_verification_auto_approve() returns trigger\n  language plpgsql security definer set search_path = public as $$\n  is_active_ops')
    const fnStart = sql.indexOf('create or replace function public.notify_verification_auto_approve()')
    const fnEnd = sql.indexOf('create trigger notify_verification_auto_approve_trg')
    const fnBody = sql.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain('is_active_ops')
  })

  it('only auto-approves when policy is verified_signal_only AND the submission is still submitted (CAS)', () => {
    expect(sql).toContain("if v_policy = 'verified_signal_only' and v_status = 'submitted' then")
    expect(sql).toContain("set status = 'approved', reviewed_at = now() where id = v_submission_id and status = 'submitted'")
  })

  it('writes a system-actor mission_review_events row, never touches ops_audit_log', () => {
    expect(sql).toContain("insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text) values (v_submission_id, 'system', null, 'approve', null, null)")
    const fnStart = sql.indexOf('create or replace function public.notify_verification_auto_approve()')
    const fnEnd = sql.indexOf('create trigger notify_verification_auto_approve_trg')
    expect(sql.slice(fnStart, fnEnd)).not.toContain('ops_audit_log_append')
  })

  it('wraps the update+insert in one exception block, gates the insert on FOUND, and logs failures instead of swallowing them', () => {
    const fnStart = sql.indexOf('create or replace function public.notify_verification_auto_approve()')
    const fnEnd = sql.indexOf('create trigger notify_verification_auto_approve_trg')
    const fnBody = sql.slice(fnStart, fnEnd)
    expect((fnBody.match(/exception when others then/gu) ?? []).length).toBe(1)
    expect(fnBody).toContain("raise warning 'notify_verification_auto_approve failed: %', sqlerrm;")
    expect(fnBody).toContain('if found then insert into public.mission_review_events')
  })

  it('admin_set_mission_auto_approve_policy gates on admin rank and validates the enum before any write', () => {
    expect(sql).toContain('create or replace function public.admin_set_mission_auto_approve_policy(p_mission_id uuid, p_policy text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;")
    expect(sql).toContain("if p_policy not in ('off', 'verified_signal_only') then raise exception 'bad_policy'; end if;")
  })

  it('admin_set_mission_auto_approve_policy raises not_found on an unknown mission, and audits the change', () => {
    expect(sql).toContain('if not found then raise exception \'not_found\'; end if;')
    expect(sql).toContain("perform public.ops_audit_log_append('mission', p_mission_id, 'mission.auto_approve_policy', null, jsonb_build_object('policy', p_policy))")
  })

  it('revokes admin_set_mission_auto_approve_policy from public/anon, grants to authenticated', () => {
    expect(sql).toContain('revoke all on function public.admin_set_mission_auto_approve_policy(uuid, text) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_set_mission_auto_approve_policy(uuid, text) to authenticated')
  })
})
