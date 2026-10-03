import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705110000_r4_agent_messages.sql'),
  'utf8',
)

describe('agent_messages migration', () => {
  it('creates the table with the mutually-exclusive identity constraint', () => {
    expect(sql).toContain('create table public.agent_messages')
    expect(sql).toContain('constraint agent_messages_exactly_one_identity check')
  })
  it('restricts role and rating to their allowed values', () => {
    expect(sql).toContain("check (role in ('user','assistant'))")
    expect(sql).toContain("check (rating in ('up','down'))")
  })
  it('enables RLS with insert-only anon/authenticated access and no anon select', () => {
    expect(sql).toContain('alter table public.agent_messages enable row level security')
    expect(sql).toContain('agent_messages_insert')
    expect(sql).toContain('traveler_user_id is null or traveler_user_id = auth.uid()')
    expect(sql).not.toContain('for select to anon')
  })
  it('grants owner-scoped select to authenticated only', () => {
    expect(sql).toContain('agent_messages_owner_select')
    expect(sql).toContain('traveler_user_id = auth.uid()')
  })
})
