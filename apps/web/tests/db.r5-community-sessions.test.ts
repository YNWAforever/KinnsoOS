// apps/web/tests/db.r5-community-sessions.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260707100000_r5_community_sessions.sql'),
  'utf8',
)

describe('R5 community_sessions + session_rsvps + rsvp_rate_limits migration', () => {
  it('creates community_sessions with the locked column set and status/type CHECKs', () => {
    expect(sql).toContain('create table public.community_sessions')
    expect(sql).toContain("check (type in ('destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro'))")
    expect(sql).toContain("check (status in ('scheduled','live','ended','cancelled'))")
    expect(sql).toContain("status text not null default 'scheduled'")
    expect(sql).toContain('host_creator_id uuid not null references public.creators(id)')
  })

  it('community_sessions RLS: public read excludes cancelled, owner policy uses direct auth.uid() equality (not a subquery)', () => {
    expect(sql).toContain('create policy community_sessions_public_read on public.community_sessions')
    expect(sql).toContain("using (status <> 'cancelled')")
    expect(sql).toContain('create policy community_sessions_owner_all on public.community_sessions')
    expect(sql).toContain('using (host_creator_id = auth.uid())')
    expect(sql).toContain('with check (host_creator_id = auth.uid())')
    expect(sql).toContain('create policy community_sessions_ops_all on public.community_sessions')
    expect(sql).toContain('is_active_ops()')
  })

  it('community_sessions has a set_updated_at trigger from the start', () => {
    expect(sql).toContain('add column if not exists updated_at')
    expect(sql).toMatch(/create trigger community_sessions_set_updated_at[\s\S]*execute (?:procedure|function) public\.set_updated_at\(\)/)
  })

  it('session_rsvps enforces email shape, uniqueness, and insert-only RLS with a NULL-safe owner check', () => {
    expect(sql).toContain('create table public.session_rsvps')
    expect(sql).toContain('references public.community_sessions(id) on delete cascade')
    expect(sql).toContain('unique(session_id, email)')
    expect(sql).toMatch(/email ~\* '\^\[\^@\[:space:\]\]\+@/)
    expect(sql).toContain('create policy session_rsvps_insert on public.session_rsvps')
    expect(sql).toContain('with check (user_id is null or user_id = auth.uid())')
    expect(sql).toContain('create policy session_rsvps_ops_read on public.session_rsvps')
    expect(sql).not.toContain('session_rsvps_public_read')
  })

  it('rsvp_rate_limits is a dedicated table/function, not a reuse of agent_rate_limits or checkout_rate_limits', () => {
    expect(sql).toContain('create table public.rsvp_rate_limits')
    expect(sql).not.toContain('agent_rate_limits')
    expect(sql).not.toContain('checkout_rate_limits')
    expect(sql).toContain('create or replace function public.check_and_increment_rsvp_rate_limit')
    expect(sql).toContain('security definer')
    expect(sql).toContain('grant execute on function public.check_and_increment_rsvp_rate_limit')
  })
})
