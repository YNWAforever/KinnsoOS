// apps/web/tests/db.r3a2-fix-migration.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704130000_r3a2_fix_confirm_booking_webhook_grant.sql'),
  'utf8',
)

describe('confirm_booking_from_webhook() grant fix', () => {
  it('explicitly revokes execute from anon and authenticated by name', () => {
    // The original migration (20260704120000) already ran `revoke all on
    // function ... from public`, but this project's default ACL
    // (pg_default_acl) auto-grants EXECUTE on newly created functions
    // directly to anon/authenticated — a `revoke ... from public` does NOT
    // undo a grant made directly to those named roles. Only this explicit
    // `revoke ... from anon, authenticated` by name closes the hole. Without
    // it, an unauthenticated caller could confirm an arbitrary
    // pending_payment booking (design spec §4.5: this RPC must be
    // service_role-only).
    expect(sql).toContain(
      'revoke execute on function public.confirm_booking_from_webhook(text, text) from anon, authenticated',
    )
  })
})
