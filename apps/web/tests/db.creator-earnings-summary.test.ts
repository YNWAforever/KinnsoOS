import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_0_creator_earnings_summary.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.0 creator_earnings_summary migration', () => {
  it('sorts after the last shipped migration', () => {
    expect(matches[0] > '20260805120400').toBe(true)
  })

  it('is a stable security definer function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.creator_earnings_summary()')
    expect(sql).toContain('returns jsonb')
    expect(sql).toContain('stable')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('gates on an active creator and raises rather than returning empty', () => {
    expect(sql).toContain("from public.creators where id = v_uid and status = 'active'")
    expect(sql).toContain("raise exception 'forbidden' using errcode = '42501'")
  })

  it('revokes every client role by name before granting authenticated', () => {
    expect(sql).toContain('revoke all on function public.creator_earnings_summary() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.creator_earnings_summary() to authenticated')
  })

  it('attributes mission settlements through mission_participants, not a creator_id column', () => {
    expect(sql).toContain('join public.mission_participants p on p.id = s.mission_participant_id')
    expect(sql).toContain('where p.creator_id = v_uid')
    expect(sql).not.toContain('mission_settlements.creator_id')
    // Alias-qualified form too. Every table reference in this function uses a short alias, so
    // the fully-qualified string above would NOT catch the bug it names — a naive attribution
    // via a nonexistent `s.creator_id` column would slip straight past it. The lookbehind is
    // required: a plain substring check also matches the harmless `bookings.creator_id` that
    // appears in a comment.
    expect(sql).not.toMatch(/(?<![a-z_])s\.creator_id/)
  })

  it('uses each table its own currency column', () => {
    expect(sql).toContain('s.amount_currency')
    expect(sql).toContain('bs.currency')
  })

  it('only counts booking rows that carry a creator leg', () => {
    expect(sql).toContain('where b.creator_id = v_uid')
    expect(sql).toContain('bs.creator_commission_amount is not null')
  })

  it('excludes already-settled affiliate events from the tracked list', () => {
    expect(sql).toContain('s2.affiliate_network_event_id = ev.id')
    expect(sql).toContain("ev.event_state in ('processing','paid')")
  })

  it('creates no table, no policy and no write path', () => {
    expect(sql).not.toContain('create table')
    expect(sql).not.toContain('create policy')
    expect(sql).not.toContain('insert into')
    expect(sql).not.toContain('update public.')
  })
})
