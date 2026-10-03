import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100600_r12_0_get_my_offer_claim.sql'),
  'utf8',
)

describe('get_my_offer_claim RPC', () => {
  it('enforces ownership inside the query, not just as a separate check', () => {
    expect(sql).toContain('and oc.visitor_user_id = auth.uid()')
  })

  it('is security definer, gated to authenticated only', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain('grant execute on function public.get_my_offer_claim(uuid) to authenticated')
  })
})
