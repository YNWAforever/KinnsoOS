import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_1_admin_mission_attention.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.1 admin_mission_attention RPC', () => {
  it('is a stable SECURITY DEFINER function gated on is_active_ops', () => {
    expect(sql).toContain('create or replace function public.admin_mission_attention()')
    expect(sql).toContain('returns jsonb')
    expect(sql).toContain('language plpgsql stable security definer set search_path = public')
    expect(sql).toContain("if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;")
  })

  it('overdue_reviews selects submitted rows past their review_deadline, oldest first, capped at 50', () => {
    expect(sql).toContain("where sub.status = 'submitted' and sub.review_deadline < now()")
    expect(sql).toContain('order by sub.review_deadline asc')
    expect(sql).toContain('limit 50')
  })

  it('at_risk_missions reuses the same three-reason heuristic as admin_mission_analytics', () => {
    expect(sql).toContain("then 'verification_failed'")
    expect(sql).toContain("then 'stalled_submissions'")
    expect(sql).toContain("else 'published_no_participants'")
    expect(sql).toContain('limit 20')
  })

  it('revokes from public/anon, grants execute to authenticated', () => {
    expect(sql).toContain('revoke all on function public.admin_mission_attention() from public, anon')
    expect(sql).toContain('grant execute on function public.admin_mission_attention() to authenticated')
  })
})
