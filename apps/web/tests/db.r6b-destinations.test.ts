// apps/web/tests/db.r6b-destinations.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260709090000_r6b_destinations.sql'),
  'utf8',
)

describe('R6B destinations migration', () => {
  it('creates destinations with the locked column set and status CHECK', () => {
    expect(sql).toContain('create table public.destinations')
    expect(sql).toContain("status text not null default 'draft' check (status in ('draft','published'))")
    expect(sql).toContain('slug text not null unique')
    expect(sql).toContain("match_terms text[] not null default '{}'")
  })

  it('has a status+sort_order index for the published/ordered index-page query', () => {
    expect(sql).toContain('create index destinations_status_sort_idx on public.destinations (status, sort_order)')
  })

  it('has an updated_at trigger', () => {
    expect(sql).toMatch(/create trigger destinations_set_updated_at[\s\S]*execute function public\.set_updated_at\(\)/)
  })

  it('RLS: public read is published-only, with zero write grant to anon/authenticated', () => {
    expect(sql).toContain('alter table public.destinations enable row level security')
    expect(sql).toContain('revoke all on public.destinations from anon, authenticated')
    expect(sql).toContain('create policy destinations_public_read on public.destinations')
    expect(sql).toContain("using (status = 'published')")
    expect(sql).not.toContain('destinations_ops_all')
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.destinations/)
    expect(sql).toContain('grant select on public.destinations to anon, authenticated')
  })

  it('adds a GIN index on community_sessions.destination_tags for the overlap match query', () => {
    expect(sql).toContain('create index community_sessions_destination_tags_idx')
    expect(sql).toContain('on public.community_sessions using gin (destination_tags)')
  })
})
