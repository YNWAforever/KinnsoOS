import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_payout_processing_window_setting.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 payout processing-window setting', () => {
  it('applies after the payout tables', () => {
    expect(matches[0] > '20260816090000').toBe(true)
  })

  it('is a single-row settings table with a positive default window', () => {
    expect(sql).toContain('create table public.creator_payout_settings')
    expect(sql).toContain('processing_window_days integer not null default 7')
    expect(sql).toContain('constraint creator_payout_settings_singleton check (id)')
  })

  it('constrains processing_window_days to be positive', () => {
    expect(sql).toContain(
      'constraint creator_payout_settings_window_positive check (processing_window_days > 0)',
    )
  })

  it('seeds the singleton row', () => {
    expect(sql).toContain('insert into public.creator_payout_settings (id) values (true)')
  })

  it('revokes client access — settings are RPC-only', () => {
    expect(sql).toContain('revoke all on public.creator_payout_settings from public, anon, authenticated')
  })

  it('exposes a read function every authenticated caller can use', () => {
    expect(sql).toContain('create function public.payout_processing_window_days()')
    expect(sql).toContain('grant execute on function public.payout_processing_window_days() to authenticated')
  })

  it('gates the write RPC on admin and requires a reason', () => {
    expect(sql).toContain('create or replace function public.admin_set_payout_processing_window(p_days integer, p_reason text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if")
  })

  it('rejects a non-positive window', () => {
    expect(sql).toContain("if p_days is null or p_days <= 0 then raise exception 'bad_window'; end if")
  })

  it('audits the change with a fixed sentinel entity id', () => {
    expect(sql).toContain("'99999999-9999-4999-8999-999999999999'")
    expect(sql).toContain("ops_audit_log_append('payout_settings'")
  })
})
