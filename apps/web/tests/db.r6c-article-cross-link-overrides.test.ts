// apps/web/tests/db.r6c-article-cross-link-overrides.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260712100000_r6c_article_cross_link_overrides.sql'),
  'utf8',
)

describe('R6C article cross-link overrides migration', () => {
  it('creates article_guide_overrides with the locked column set and uniqueness constraint', () => {
    expect(sql).toContain('create table public.article_guide_overrides')
    expect(sql).toContain('article_id uuid not null references public.articles(id) on delete cascade')
    expect(sql).toContain('guide_id uuid not null references public.guides(id) on delete cascade')
    expect(sql).toContain('unique(article_id, guide_id)')
  })

  it('creates article_experience_overrides with the locked column set and uniqueness constraint', () => {
    expect(sql).toContain('create table public.article_experience_overrides')
    expect(sql).toContain('article_id uuid not null references public.articles(id) on delete cascade')
    expect(sql).toContain('experience_id uuid not null references public.experiences(id) on delete cascade')
    expect(sql).toContain('unique(article_id, experience_id)')
  })

  it('both tables: public read, zero write grant to anon/authenticated (ops writes via table editor only)', () => {
    expect(sql).toContain('alter table public.article_guide_overrides enable row level security')
    expect(sql).toContain('create policy article_guide_overrides_public_read on public.article_guide_overrides')
    expect(sql).toContain('alter table public.article_experience_overrides enable row level security')
    expect(sql).toContain('create policy article_experience_overrides_public_read on public.article_experience_overrides')
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.article_guide_overrides/)
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.article_experience_overrides/)
    expect(sql).toContain('grant select on public.article_guide_overrides to anon, authenticated')
    expect(sql).toContain('grant select on public.article_experience_overrides to anon, authenticated')
  })

  it('indexes both tables by article_id for the per-article override lookup', () => {
    expect(sql).toContain('create index article_guide_overrides_article_idx on public.article_guide_overrides (article_id, sort_order)')
    expect(sql).toContain('create index article_experience_overrides_article_idx on public.article_experience_overrides (article_id, sort_order)')
  })
})
