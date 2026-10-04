import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120400_r12_1_creator_visits_driven.sql'),
  'utf8',
)

describe('creator_insights visits_driven widening', () => {
  it('adds a visits_driven total scoped to the calling creator', () => {
    expect(sql).toContain("'visits_driven', coalesce((")
    // creator_insights() resolves the caller into v_uid (== auth.uid()), which is
    // compared DIRECTLY against creators.id elsewhere in the function (the
    // forbidden-check `where id = v_uid`) -- unlike merchant_insights, there is no
    // separate profile-row indirection to resolve first, so the new count must reuse
    // that same v_uid rather than re-deriving auth.uid() or trusting a parameter.
    expect(sql).toContain('where oc.creator_id = v_uid')
  })

  it('counts offer_redemptions joined through offer_claims, not a raw claim count', () => {
    expect(sql).toContain('from public.offer_redemptions orr')
    expect(sql).toContain('join public.offer_claims oc on oc.id = orr.offer_claim_id')
  })

  it('keeps creator_insights a zero-arg function (pure additive change, no signature change)', () => {
    expect(sql).toContain('create or replace function public.creator_insights()')
    expect(sql).not.toContain('drop function public.creator_insights')
  })

  it('leaves every existing key and its query completely unchanged', () => {
    expect(sql).toContain("'points_total',")
    expect(sql).toContain("'points_before_window',")
    expect(sql).toContain("'points_by_type', coalesce((")
    expect(sql).toContain("'points_trajectory', coalesce((")
    expect(sql).toContain("'guides_published',")
    expect(sql).toContain("'guide_saves_total',")
    expect(sql).toContain("'missions_by_status', coalesce((")
    expect(sql).toContain("'submissions_approved', (")
  })

  it('re-asserts grants: authenticated only, revoked from public/anon', () => {
    expect(sql).toContain('revoke all on function public.creator_insights() from public, anon;')
    expect(sql).toContain('grant execute on function public.creator_insights() to authenticated;')
  })
})
