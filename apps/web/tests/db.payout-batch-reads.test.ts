import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_payout_batch_reads.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 payout batch read RPCs', () => {
  it('applies after the settle RPCs', () => {
    expect(matches[0] > '20260816090300').toBe(true)
  })

  it('creator_payout_batches_mine gates on the same active-creator check as creator_earnings_summary', () => {
    expect(sql).toContain('create or replace function public.creator_payout_batches_mine()')
    expect(sql).toContain("if not exists (select 1 from public.creators where id = v_uid and status = 'active') then")
    expect(sql).toContain('security definer')
  })

  it('creator_payout_batches_mine scopes strictly to the caller', () => {
    expect(sql).toContain('where b.creator_id = v_uid')
  })

  it('creator_payout_batches_mine falls back to an empty array, not null, when the creator has no batches', () => {
    // jsonb_agg(...) over zero rows returns SQL NULL, not [] — this coalesce is load-bearing,
    // not decorative. Losing it would turn "no batches yet" into a null payload.
    expect(sql).toContain("from public.creator_payout_batches b where b.creator_id = v_uid ), '[]'::jsonb)")
  })

  it('admin_list_payout_batches is a read gated at the analyst level, not admin', () => {
    expect(sql).toContain('create or replace function public.admin_list_payout_batches(p_status text default null)')
    expect(sql).toContain("if not public.is_active_ops_role('analyst') then")
  })

  it('admin_list_payout_batches validates its status filter and joins the creator name', () => {
    expect(sql).toContain("if p_status is not null and p_status not in ('pending', 'paid', 'cancelled') then raise exception 'bad_status'; end if")
    expect(sql).toContain('join public.creators c on c.id = b.creator_id')
  })

  it('both revoke anon/public and grant only authenticated', () => {
    expect(sql).toContain('revoke all on function public.creator_payout_batches_mine() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.creator_payout_batches_mine() to authenticated')
    expect(sql).toContain('revoke all on function public.admin_list_payout_batches(text) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_list_payout_batches(text) to authenticated')
  })
})
