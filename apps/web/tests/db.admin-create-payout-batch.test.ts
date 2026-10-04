import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_admin_create_payout_batch.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 admin_create_payout_batch RPC', () => {
  it('applies after the settings migration', () => {
    expect(matches[0] > '20260816090100').toBe(true)
  })

  it('is a security definer function gated on admin', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
  })

  it('requires every business field before touching the database', () => {
    expect(sql).toContain("if p_creator_id is null then raise exception 'creator_required'; end if")
    expect(sql).toContain("if coalesce(btrim(p_currency), '') = '' then raise exception 'currency_required'; end if")
    expect(sql).toContain("if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if")
    expect(sql).toContain("if coalesce(btrim(p_idempotency_key), '') = '' then raise exception 'idempotency_key_required'; end if")
  })

  it('rejects a target date in the past', () => {
    expect(sql).toContain("if p_target_at is not null and p_target_at < now() then raise exception 'target_at_in_past'; end if")
  })

  it('computes a deterministic request hash from its own arguments with no extension dependency', () => {
    expect(sql).toContain('v_hash := md5(concat_ws')
  })

  it('replays an identical payload as a no-op and rejects a mismatched one', () => {
    expect(sql).toContain("if v_existing.request_hash <> v_hash then")
    expect(sql).toContain("raise exception 'idempotency_conflict'")
    expect(sql).toContain("'replayed', true")
  })

  it('resolves a concurrent double-first-submission by re-checking after a unique_violation, rather than leaking a raw DB error', () => {
    expect(sql).toContain('exception when unique_violation then')
    expect(sql).toContain('if not found then')
    expect(sql).toContain('raise;')
  })

  it('refuses a second pending batch for the same creator and currency', () => {
    expect(sql).toContain("raise exception 'batch_already_pending'")
  })

  it('falls back to the configured processing window when no target date is given', () => {
    expect(sql).toContain('coalesce(p_target_at, now() + make_interval(days => public.payout_processing_window_days()))')
  })

  it('writes both the batch and its approving decision', () => {
    expect(sql).toContain('insert into public.creator_payout_batches')
    expect(sql).toContain("insert into public.creator_payout_decisions")
    expect(sql).toContain("'approved'")
  })

  it('audits the creation', () => {
    expect(sql).toContain("ops_audit_log_append('payout_batch', v_batch_id, 'payout_batch.create'")
  })

  it('revokes public and anon execute', () => {
    expect(sql).toContain(
      'revoke all on function public.admin_create_payout_batch(uuid, text, numeric, text, text, timestamptz) from public, anon',
    )
  })
})
