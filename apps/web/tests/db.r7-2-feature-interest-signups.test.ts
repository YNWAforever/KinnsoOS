import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260714072649_r7_2_feature_interest_signups.sql'),
  'utf8',
)

describe('R7.2 feature interest signups migration', () => {
  it('creates the generic signup table with the locked columns and constraints', () => {
    expect(sql).toContain('create table public.feature_interest_signups')
    expect(sql).toContain('id uuid primary key default gen_random_uuid()')
    expect(sql).toContain("feature text not null check (feature in ('agent', 'booking', 'sessions'))")
    expect(sql).toContain('email text not null')
    expect(sql).toContain("locale text not null check (locale in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th'))")
    expect(sql).toContain('created_at timestamptz not null default now()')
    expect(sql).toContain('unique (feature, email)')
  })

  it('allows only active ops to select signups and exposes no direct public writes', () => {
    expect(sql).toContain('alter table public.feature_interest_signups enable row level security')
    expect(sql).toContain('revoke all on table public.feature_interest_signups from anon, authenticated')
    expect(sql).toContain('grant select on table public.feature_interest_signups to authenticated')
    expect(sql).toContain('create policy feature_interest_signups_ops_read')
    expect(sql).toContain('on public.feature_interest_signups for select to authenticated')
    expect(sql).toContain('using (public.is_active_ops())')
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete)(?:\s*,\s*(?:insert|update|delete))*\s+on\s+(?:table\s+)?public\.feature_interest_signups\s+to\s+(?:anon|authenticated)/i,
    )
  })

  it('creates an audited, normalized, idempotent RPC with strict execution grants', () => {
    expect(sql).toContain(
      'create or replace function public.join_feature_interest(p_feature text, p_email text, p_locale text)',
    )
    expect(sql).toContain('returns boolean')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain("p_feature not in ('agent', 'booking', 'sessions')")
    expect(sql).toContain("p_locale not in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th')")
    expect(sql).toContain("lower(btrim(p_email))")
    expect(sql).toContain("~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'")
    expect(sql).toContain('char_length(v_email) <= 254')
    expect(sql).toContain('on conflict (feature, email) do nothing')
    expect(sql).toContain('return true')
    expect(sql).toContain(
      'revoke all on function public.join_feature_interest(text, text, text) from public',
    )
    expect(sql).toContain(
      'grant execute on function public.join_feature_interest(text, text, text) to anon, authenticated',
    )
  })
})
