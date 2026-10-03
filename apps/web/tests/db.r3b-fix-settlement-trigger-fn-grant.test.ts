// apps/web/tests/db.r3b-fix-settlement-trigger-fn-grant.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704151500_r3b_fix_settlement_trigger_fn_grant.sql'),
  'utf8',
)

describe('create_booking_settlement_on_confirm() grant fix', () => {
  it('explicitly revokes execute from anon and authenticated by name', () => {
    // Flagged by the live security advisor: this project's default privileges
    // auto-grant EXECUTE to anon/authenticated on every new function, including
    // trigger-return-type ones. Not live-exploitable (Postgres rejects a direct RPC
    // call to a trigger function), but every other SECURITY DEFINER function in this
    // codebase closes this explicitly -- this one shouldn't be the exception.
    expect(sql).toContain(
      'revoke all on function public.create_booking_settlement_on_confirm() from public, anon, authenticated',
    )
  })
})
