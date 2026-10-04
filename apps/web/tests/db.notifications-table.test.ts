import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_3_notifications_table.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.3 notifications table', () => {
  it('creates the table with every required column', () => {
    expect(sql).toContain('create table public.notifications')
    expect(sql).toContain('creator_id uuid not null references public.creators(id)')
    expect(sql).toContain('notification_type text not null')
    expect(sql).toContain('entity_type text not null')
    expect(sql).toContain('entity_id uuid not null')
    expect(sql).toContain("payload jsonb not null default '{}'::jsonb")
    expect(sql).toContain('read_at timestamptz')
    expect(sql).toContain('created_at timestamptz not null default now()')
  })

  it('caps the payload at 8 KiB', () => {
    expect(sql).toContain('check (pg_column_size(payload) <= 8192)')
  })

  it('indexes the feed query and the unread count separately', () => {
    expect(sql).toContain('create index notifications_creator_created_idx on public.notifications (creator_id, created_at desc)')
    expect(sql).toContain('create index notifications_creator_unread_idx on public.notifications (creator_id) where read_at is null')
  })

  it('enables RLS with exactly self-select and read_at-only self-update', () => {
    expect(sql).toContain('alter table public.notifications enable row level security')
    expect(sql).toContain('create policy notifications_select_own on public.notifications for select using (creator_id = auth.uid())')
    expect(sql).toContain('create policy notifications_update_own on public.notifications for update using (creator_id = auth.uid()) with check (creator_id = auth.uid())')
  })

  it('revokes all table access then grants only select and read_at update to authenticated', () => {
    expect(sql).toContain('revoke all on public.notifications from public, anon, authenticated')
    expect(sql).toContain('grant select on public.notifications to authenticated')
    expect(sql).toContain('grant update (read_at) on public.notifications to authenticated')
  })

  it('grants no insert to any client role', () => {
    expect(sql).not.toContain('grant insert')
  })
})
