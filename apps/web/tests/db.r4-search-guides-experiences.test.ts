import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705100000_r4_search_guides_and_experiences.sql'),
  'utf8',
)

describe('search_guides / search_experiences migration', () => {
  it('adds a generated tsvector column to guides, indexed with gin', () => {
    expect(sql).toContain('alter table public.guides add column tsv tsvector')
    expect(sql).toContain('generated always as')
    expect(sql).toContain('create index guides_tsv_idx on public.guides using gin(tsv)')
  })
  it('adds a generated tsvector column to experiences, indexed with gin', () => {
    expect(sql).toContain('alter table public.experiences add column tsv tsvector')
    expect(sql).toContain('create index experiences_tsv_idx on public.experiences using gin(tsv)')
  })
  it('search_guides is SECURITY INVOKER and uses websearch_to_tsquery', () => {
    expect(sql).toContain('create or replace function public.search_guides')
    expect(sql).toContain('security invoker')
    expect(sql).toContain("websearch_to_tsquery('simple', p_q)")
    expect(sql).toContain('grant execute on function public.search_guides')
  })
  it('search_experiences is SECURITY INVOKER, filters to published, and uses websearch_to_tsquery', () => {
    expect(sql).toContain('create or replace function public.search_experiences')
    expect(sql).toContain("websearch_to_tsquery('simple', p_q)")
    expect(sql).toContain("status = 'published'")
    expect(sql).toContain('grant execute on function public.search_experiences')
  })
})
