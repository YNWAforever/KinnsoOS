import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_0_mission_review_events.sql'))
expect(matches).toHaveLength(1)
const rawSql = readFileSync(join(dir, matches[0]), 'utf8')
const sql = rawSql.toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.0 mission_review_events table + review_deadline column', () => {
  it('creates the events table with every required column', () => {
    expect(sql).toContain('create table public.mission_review_events')
    expect(sql).toContain('submission_id uuid not null references public.mission_milestone_submissions(id) on delete cascade')
    expect(sql).toContain("actor_type text not null check (actor_type in ('creator', 'merchant', 'ops', 'system'))")
    expect(sql).toContain('actor_id uuid')
    expect(sql).toContain("action text not null check (action in ('approve', 'reject', 'request_revision'))")
    expect(sql).toContain('reason_category text')
    expect(sql).toContain('reason_text text')
    expect(sql).toContain('created_at timestamptz not null default now()')
  })

  it('requires a reason_category whenever the action is reject or request_revision', () => {
    expect(sql).toContain("constraint mission_review_events_reason_required_check check (action not in ('reject', 'request_revision') or reason_category is not null)")
  })

  it('constrains reason_category to the five Adfocate categories when present', () => {
    expect(sql).toContain("constraint mission_review_events_reason_category_check check (reason_category is null or reason_category in ('format', 'key_message', 'compliance', 'quality', 'other'))")
  })

  it('indexes by submission for the detail page history read', () => {
    expect(sql).toContain('create index mission_review_events_submission_idx on public.mission_review_events (submission_id, created_at desc)')
  })

  it('enables RLS with select for creator, merchant, and ops only', () => {
    expect(sql).toContain('alter table public.mission_review_events enable row level security')
    expect(sql).toContain('create policy mission_review_events_select on public.mission_review_events')
  })

  it('grants no insert/update/delete to any client role', () => {
    expect(sql).toContain('revoke all on public.mission_review_events from public, anon, authenticated')
    expect(sql).toContain('grant select on public.mission_review_events to authenticated')
    expect(sql).not.toContain('grant insert')
    expect(sql).not.toContain('grant update')
  })

  it('adds review_deadline to mission_milestone_submissions with a backfill', () => {
    expect(sql).toContain('alter table public.mission_milestone_submissions add column review_deadline timestamptz')
    expect(sql).toContain("update public.mission_milestone_submissions set review_deadline = submitted_at + interval '48 hours' where submitted_at is not null and review_deadline is null")
  })

  it('adds a trigger that resets the deadline whenever submitted_at changes', () => {
    expect(sql).toContain('create or replace function public.set_submission_review_deadline() returns trigger')
    expect(sql).toContain("new.review_deadline := new.submitted_at + interval '48 hours'")
    expect(sql).toContain('create trigger set_submission_review_deadline_trg')
    expect(sql).toContain('before insert or update on public.mission_milestone_submissions')
  })

  it('branches on TG_OP as separate if/elsif paths, never referencing OLD inside the INSERT branch', () => {
    // Checked against the RAW (non-lowercased) file -- `sql` above is lowercased for every
    // other assertion in this file, which can't tell a correct uppercase `TG_OP = 'INSERT'`
    // comparison from a broken lowercase `tg_op = 'insert'` one (Postgres's TG_OP is always
    // uppercase; a lowercase literal would silently never match on a real INSERT).
    expect(rawSql).toContain("TG_OP = 'INSERT'")

    // Also checked structurally, not just for the string's presence: the INSERT and UPDATE
    // paths must be separate if/elsif branches, never a single
    // `TG_OP = 'INSERT' or new.x is distinct from old.x` boolean OR. That anti-pattern
    // throws "record old is not assigned yet" on a real INSERT, because PL/pgSQL's OLD is
    // unassigned there and Postgres does not guarantee left-to-right short-circuit of OR the
    // way procedural languages do. A single-OR revert would still contain the substring
    // `TG_OP = 'INSERT'` above, so that check alone can't catch it -- these assertions can.
    expect(rawSql).toContain("if TG_OP = 'INSERT' then")
    expect(rawSql).toContain('elsif')

    const insertBranchStart = rawSql.indexOf("if TG_OP = 'INSERT' then")
    expect(insertBranchStart).toBeGreaterThanOrEqual(0)
    const elsifIndex = rawSql.indexOf('elsif', insertBranchStart)
    expect(elsifIndex).toBeGreaterThan(insertBranchStart)

    const insertBranchBody = rawSql.slice(insertBranchStart, elsifIndex).toLowerCase()
    expect(insertBranchBody).not.toContain('old.')

    const elsifBranchBody = rawSql.slice(elsifIndex).toLowerCase()
    expect(elsifBranchBody).toContain('old.submitted_at')
  })
})
