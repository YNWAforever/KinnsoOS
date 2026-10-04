import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260720105725_r7_5_session_waitlist.sql',
)

describe('R7.5 session waitlist migration', () => {
  it('creates a normalized, idempotent session waitlist with the locked columns', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('create table public.session_waitlist')
    expect(sql).toContain('id uuid primary key default gen_random_uuid()')
    expect(sql).toContain('email text not null')
    expect(sql).toContain('char_length(email) <= 254')
    expect(sql).toContain("email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'")
    expect(sql).toContain('email = lower(btrim(email))')
    expect(sql).toContain('user_id uuid references auth.users(id) on delete set null')
    expect(sql).toContain("locale text not null check (locale in ('en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn'))")
    expect(sql).toContain('created_at timestamptz not null default now()')
    expect(sql).toMatch(/create unique index\s+\w+\s+on public\.session_waitlist\s*\(lower\(email\)\)/)
  })

  it('denies direct public inserts while keeping reads ops-only', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('alter table public.session_waitlist enable row level security')
    expect(sql).toContain('revoke all on table public.session_waitlist from public, anon, authenticated')
    expect(sql).toContain('revoke insert on table public.session_waitlist from anon, authenticated')
    expect(sql).not.toContain('grant insert on table public.session_waitlist to anon, authenticated')
    expect(sql).not.toMatch(/create policy\s+\w*session_waitlist\w*\s+on public\.session_waitlist\s+for\s+insert/)
    expect(sql).toContain('grant select on table public.session_waitlist to authenticated')
    expect(sql).toContain('create policy session_waitlist_ops_read')
    expect(sql).toContain('on public.session_waitlist for select to authenticated')
    expect(sql).toContain('using ((select public.is_active_ops()))')
    expect(sql).not.toMatch(/create policy\s+\w*session_waitlist\w*\s+on public\.session_waitlist\s+for\s+(?:update|delete)/)
    expect(sql).not.toMatch(/grant\s+(?:update|delete)(?:\s*,\s*(?:update|delete))*\s+on table public\.session_waitlist\s+to\s+(?:anon|authenticated)/)
  })
})
