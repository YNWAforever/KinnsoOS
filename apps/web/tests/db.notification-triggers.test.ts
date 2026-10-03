import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_3_notification_triggers.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.3 notification triggers (submission + settlement)', () => {
  it('applies after the notifications table', () => {
    expect(matches[0] > '20260817090000').toBe(true)
  })

  it('submission trigger fires only on a real status change to one of three terminal states', () => {
    expect(sql).toContain('create or replace function public.notify_submission_status_change()')
    expect(sql).toContain('after update on public.mission_milestone_submissions')
    expect(sql).toContain('if new.status is not distinct from old.status then return new; end if')
    expect(sql).toContain("if new.status not in ('approved', 'rejected', 'revision_requested') then return new; end if")
  })

  it('submission trigger resolves the creator and mission title through the milestone join', () => {
    expect(sql).toContain('join public.mission_milestones ms on ms.id = new.mission_milestone_id')
    expect(sql).toContain('join public.missions m on m.id = ms.mission_id')
    expect(sql).toContain('where p.id = new.mission_participant_id')
  })

  it('settlement trigger fires on insert and resolves the creator through mission_participant_id', () => {
    expect(sql).toContain('create or replace function public.notify_settlement_created()')
    expect(sql).toContain('after insert on public.mission_settlements')
    expect(sql).toContain('where p.id = new.mission_participant_id')
    expect(sql).toContain('if v_creator_id is null then return new; end if')
  })

  it('does not reference creator_payout_batches (deferred to Task 2b)', () => {
    expect(sql).not.toContain('creator_payout_batches')
    expect(sql).not.toContain('notify_payout_batch_change')
  })

  it('every insert into notifications is tightly scoped: begin directly precedes it, and nothing but the insert sits inside the guard', () => {
    // "begin" must be immediately followed by the insert (only whitespace between) — this is
    // what proves the exception block wraps JUST the insert, not the creator-resolution select
    // above it. A regression that widens the begin/exception block upward would break this.
    const beginInsertMatches = sql.match(/begin insert into public\.notifications/gu) ?? []
    expect(beginInsertMatches).toHaveLength(2)

    // Split on that anchor: each fragment starts right after "begin insert into
    // public.notifications" and should reach its own "exception when others then null" having
    // seen exactly one values(...) clause and no select keyword (which would indicate
    // creator-resolution logic leaking into the guarded block).
    const guardedFragments = sql.split('begin insert into public.notifications').slice(1)
    expect(guardedFragments).toHaveLength(2)

    for (const fragment of guardedFragments) {
      const exceptionIndex = fragment.indexOf('exception when others then null')
      expect(exceptionIndex).toBeGreaterThan(-1)
      const guarded = fragment.slice(0, exceptionIndex)

      expect((guarded.match(/values \(/gu) ?? []).length).toBe(1)
      expect(guarded).not.toContain('select ')
      expect(guarded).not.toContain('insert into public.notifications')
      expect(guarded.trim().endsWith(';')).toBe(true)
    }
  })

  it('revokes execute from every client role on both trigger functions', () => {
    expect(sql).toContain('revoke all on function public.notify_submission_status_change() from public, anon, authenticated, service_role')
    expect(sql).toContain('revoke all on function public.notify_settlement_created() from public, anon, authenticated, service_role')
  })
})
