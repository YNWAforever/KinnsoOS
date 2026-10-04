import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260706090000_r6a_saves_and_reviews.sql'),
  'utf8',
)

const fixSql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260712090000_r6a_fix_reviews_ops_select.sql'),
  'utf8',
)

describe('R6A guide_saves + experience_saves migration', () => {
  it('creates guide_saves with a uuid PK, FK columns, and a uniqueness constraint', () => {
    expect(sql).toContain('create table public.guide_saves')
    expect(sql).toContain('guide_id uuid not null references public.guides(id) on delete cascade')
    expect(sql).toContain('traveler_user_id uuid not null references auth.users(id) on delete cascade')
    expect(sql).toContain('unique (guide_id, traveler_user_id)')
  })

  it('guide_saves RLS: owner-scoped, no anon grant, direct auth.uid() equality (not a subquery)', () => {
    expect(sql).toContain('create policy guide_saves_owner_all on public.guide_saves')
    expect(sql).toContain('using (traveler_user_id = auth.uid())')
    expect(sql).toContain('with check (traveler_user_id = auth.uid())')
    expect(sql).toMatch(/revoke all on public\.guide_saves from anon, authenticated/)
    expect(sql).toMatch(/grant select, insert, delete on public\.guide_saves to authenticated/)
  })

  it('adds experiences.saves_count and creates experience_saves with the same shape', () => {
    expect(sql).toContain('alter table public.experiences add column saves_count integer not null default 0')
    expect(sql).toContain('create table public.experience_saves')
    expect(sql).toContain('experience_id uuid not null references public.experiences(id) on delete cascade')
    expect(sql).toContain('unique (experience_id, traveler_user_id)')
    expect(sql).toContain('create policy experience_saves_owner_all on public.experience_saves')
  })

  it('both save tables get a count-sync trigger, and the trigger functions have no client-role grant', () => {
    expect(sql).toMatch(/create trigger guide_saves_sync_count_trigger\s+after insert or delete on public\.guide_saves/)
    expect(sql).toContain('update public.guides set saves_count = saves_count + 1 where id = new.guide_id')
    expect(sql).toContain('update public.guides set saves_count = greatest(saves_count - 1, 0) where id = old.guide_id')
    expect(sql).toMatch(/create trigger experience_saves_sync_count_trigger\s+after insert or delete on public\.experience_saves/)
    expect(sql).toContain('update public.experiences set saves_count = saves_count + 1 where id = new.experience_id')
    expect(sql).toContain('update public.experiences set saves_count = greatest(saves_count - 1, 0) where id = old.experience_id')
    expect(sql).toMatch(/revoke all on function public\.guide_saves_sync_count\(\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/revoke all on function public\.experience_saves_sync_count\(\) from public, anon, authenticated, service_role/)
  })

  it('both save tables index traveler_user_id for the /trips saved-list queries, matching this codebase\'s per-FK-index convention', () => {
    expect(sql).toContain('create index guide_saves_traveler_idx on public.guide_saves(traveler_user_id, created_at desc)')
    expect(sql).toContain('create index experience_saves_traveler_idx on public.experience_saves(traveler_user_id, created_at desc)')
  })
})

describe('R6A reviews table + get_booking_by_checkout_session extension', () => {
  it('creates reviews with denormalized experience_id/guide_id and a unique booking_id', () => {
    expect(sql).toContain('create table public.reviews')
    expect(sql).toContain('booking_id uuid not null unique references public.bookings(id) on delete cascade')
    expect(sql).toContain('experience_id uuid not null references public.experiences(id) on delete cascade')
    expect(sql).toContain('guide_id uuid references public.guides(id) on delete cascade')
    expect(sql).toContain("check (rating between 1 and 5)")
    expect(sql).toContain("check (status in ('published', 'hidden'))")
  })

  it('reviews_insert validates the booking is the caller\'s own, completed, and its id columns match exactly', () => {
    expect(sql).toContain('create policy reviews_insert on public.reviews')
    expect(sql).toContain('traveler_user_id = auth.uid()')
    expect(sql).toContain("b.status = 'completed'")
    expect(sql).toContain('b.experience_id = reviews.experience_id')
    expect(sql).toContain('b.guide_id is not distinct from reviews.guide_id')
  })

  it('reviews has both an owner-select and a public-published-only select policy', () => {
    expect(sql).toContain('create policy reviews_owner_select on public.reviews')
    expect(sql).toContain('using (traveler_user_id = auth.uid())')
    expect(sql).toContain('create policy reviews_public_select on public.reviews')
    expect(sql).toContain("using (status = 'published')")
  })

  it('reviews_ops_update is the only UPDATE policy, gated on is_active_ops()', () => {
    expect(sql).toContain('create policy reviews_ops_update on public.reviews')
    expect(sql).toContain('public.is_active_ops()')
  })

  it('reviews_ops_select lets ops see reviews of any status (fix: RETURNING under RLS needs SELECT visibility)', () => {
    expect(fixSql).toContain('create policy reviews_ops_select on public.reviews')
    expect(fixSql).toContain('for select to authenticated')
    expect(fixSql).toContain('using (public.is_active_ops())')
  })

  it('extends get_booking_by_checkout_session with traveler_user_id, experience_id, and guide_id', () => {
    expect(sql).toMatch(/create or replace function public\.get_booking_by_checkout_session/)
    expect(sql).toContain('traveler_user_id uuid, experience_id uuid, guide_id uuid')
    expect(sql).toContain('b.traveler_user_id, b.experience_id, b.guide_id')
  })

  it('drops get_booking_by_checkout_session before redefining it, since Postgres cannot change RETURNS TABLE shape via CREATE OR REPLACE', () => {
    expect(sql).toContain('drop function if exists public.get_booking_by_checkout_session(text)')
    expect(sql.indexOf('drop function if exists public.get_booking_by_checkout_session(text)'))
      .toBeLessThan(sql.indexOf('create or replace function public.get_booking_by_checkout_session(p_session_id text)'))
  })
})
