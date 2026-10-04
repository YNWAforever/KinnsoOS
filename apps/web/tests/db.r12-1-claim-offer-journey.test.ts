import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120100_r12_1_claim_offer_journey_capture.sql'),
  'utf8',
)

describe('claim_offer journey/locale capture', () => {
  it('adds p_journey_id and p_locale as optional trailing params', () => {
    expect(sql).toContain('p_journey_id uuid default null')
    expect(sql).toContain('p_locale text default null')
  })

  it('drops the old 4-arg overload before recreating claim_offer, so the two signatures do not coexist', () => {
    expect(sql).toContain('drop function if exists public.claim_offer(uuid, uuid, uuid, text);')
  })

  it('keeps the original params (order and defaults) unchanged ahead of the new trailing ones', () => {
    expect(sql).toContain(
      'create or replace function public.claim_offer(\n' +
        '  p_offer_id uuid,\n' +
        '  p_creator_id uuid,\n' +
        '  p_guide_id uuid default null,\n' +
        "  p_source text default 'profile',\n" +
        '  p_journey_id uuid default null,\n' +
        '  p_locale text default null\n' +
        ')',
    )
  })

  it('stores both new values on the offer_claims insert', () => {
    expect(sql).toContain('analytics_journey_id, analytics_locale')
    expect(sql).toContain('p_journey_id, p_locale')
  })

  it('preserves the function as security definer with search_path pinned', () => {
    expect(sql).toContain('security definer set search_path = public')
  })

  it('preserves real, distinctive validation guards from the shipped R12.0 body verbatim', () => {
    // unauthorized / visitor guard
    expect(sql).toContain("if v_visitor is null then raise exception 'unauthorized' using errcode = '42501'; end if;")
    // per-visitor claim limit guard, distinctive to this function
    expect(sql).toContain("if v_active_count >= v_offer.per_visitor_limit then\n    raise exception 'visitor_limit_reached';")
    // creator eligibility guard against mission_participants
    expect(sql).toContain('creator_not_eligible')
    // offer cap guard
    expect(sql).toContain('offer_cap_reached')
  })

  it('preserves the token generation logic unchanged', () => {
    expect(sql).toContain("v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');")
    expect(sql).toContain("v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');")
  })

  it('locks the revoke/grant to the real, widened 6-argument signature', () => {
    expect(sql).toContain(
      'revoke all on function public.claim_offer(uuid, uuid, uuid, text, uuid, text) from public, anon;',
    )
    expect(sql).toContain(
      'grant execute on function public.claim_offer(uuid, uuid, uuid, text, uuid, text) to authenticated;',
    )
    // guard against a stale 4-arg signature reference sneaking back in
    expect(sql).not.toContain('function public.claim_offer(uuid, uuid, uuid, text)')
  })
})
