import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_3_notification_trigger_payout_batch.sql'))
expect(matches).toHaveLength(1)
const rawSql = readFileSync(join(dir, matches[0]), 'utf8')
const sql = rawSql.toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.3 payout-batch notification trigger (text contract only — creator_payout_batches does not exist on this branch; live verification deferred to Task 8 post-R10.2-merge)', () => {
  it('applies after the submission/settlement trigger migration', () => {
    expect(matches[0] > '20260817090100').toBe(true)
  })

  it('checks TG_OP against the uppercase value Postgres actually sets (case-sensitive check against the raw, non-lowercased file)', () => {
    expect(rawSql).toContain("tg_op = 'INSERT'")
    expect(rawSql).not.toContain("tg_op = 'insert'")
  })

  it('covers create, paid, and cancelled from one function', () => {
    expect(sql).toContain('create or replace function public.notify_payout_batch_change()')
    expect(sql).toContain('security definer')
    expect(sql).toContain('after insert or update on public.creator_payout_batches')
    expect(sql).toContain("if tg_op = 'insert' then")
    expect(sql).toContain("v_type := 'payout_batch.created'")
    expect(sql).toContain("when 'paid' then 'payout_batch.paid'")
    expect(sql).toContain("when 'cancelled' then 'payout_batch.cancelled'")
  })

  it('no-ops when the update is not a status change', () => {
    expect(sql).toContain('elsif new.status is distinct from old.status then')
    expect(sql).toContain('else return new; end if')
  })

  it('resolves creator_id directly (no join needed) and inserts with amount/currency payload', () => {
    expect(sql).toContain('values (new.creator_id, v_type, \'payout_batch\', new.id')
    expect(sql).toContain("jsonb_build_object('currency', new.currency, 'amount', new.amount)")
  })

  it('wraps its insert so a failure cannot roll back the payout batch mutation', () => {
    const inserts = sql.split('insert into public.notifications').length - 1
    expect(inserts).toBe(1)
    const guarded = sql.split('exception when others then null').length - 1
    expect(guarded).toBe(1)
  })

  it('revokes execute from every client role', () => {
    expect(sql).toContain('revoke all on function public.notify_payout_batch_change() from public, anon, authenticated, service_role')
  })
})
