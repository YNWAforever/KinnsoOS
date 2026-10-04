import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120200_r12_1_redeem_emits_offer_redeemed.sql'),
  'utf8',
)

describe('redeem_offer_claim emits offer_redeemed', () => {
  it('does not change the parameter list -- same signature as the shipped R12.0 version', () => {
    expect(sql).toContain(
      'create or replace function public.redeem_offer_claim(\n' +
        '  p_raw_token text,\n' +
        '  p_amount_spent numeric default null\n' +
        ')',
    )
    // this task's signature is unchanged, so unlike claim_offer's own R12.1 fix, no
    // DROP FUNCTION is needed -- guard against one sneaking in by mistake
    expect(sql).not.toContain('drop function')
  })

  it('locks the revoke/grant to the real, unchanged 2-argument signature', () => {
    expect(sql).toContain('revoke all on function public.redeem_offer_claim(text, numeric) from public, anon;')
    expect(sql).toContain('grant execute on function public.redeem_offer_claim(text, numeric) to authenticated;')
  })

  it('selects the claim\'s analytics_journey_id and analytics_locale', () => {
    expect(sql).toContain(
      'select id, offer_id, status, expires_at, analytics_journey_id, analytics_locale\n' +
        '    into v_claim',
    )
  })

  it('only inserts the event when analytics_journey_id is set', () => {
    expect(sql).toContain('if v_claim.analytics_journey_id is not null then')
  })

  it('inserts after the real-redemption write, using the stored journey/locale and offer id', () => {
    const redemptionInsertIdx = sql.indexOf('insert into public.offer_redemptions')
    const counterUpdateIdx = sql.indexOf('update public.merchant_offers set redeemed_count')
    const eventInsertIdx = sql.indexOf('insert into public.traveller_analytics_events')
    expect(redemptionInsertIdx).toBeGreaterThan(-1)
    expect(counterUpdateIdx).toBeGreaterThan(redemptionInsertIdx)
    expect(eventInsertIdx).toBeGreaterThan(counterUpdateIdx)
    expect(sql).toContain("'offer_redeemed'")
    expect(sql).toContain('v_claim.analytics_journey_id')
    expect(sql).toContain('v_claim.analytics_locale')
    expect(sql).toContain('v_offer.id::text')
  })

  it('the already_redeemed and expired branches both return before the event insert', () => {
    const alreadyRedeemedIdx = sql.indexOf("'already_redeemed', true")
    const expiredIdx = sql.indexOf("'expired', true")
    const eventCheckIdx = sql.indexOf('if v_claim.analytics_journey_id is not null then')

    expect(alreadyRedeemedIdx).toBeGreaterThan(-1)
    expect(expiredIdx).toBeGreaterThan(-1)
    expect(eventCheckIdx).toBeGreaterThan(-1)
    expect(alreadyRedeemedIdx).toBeLessThan(eventCheckIdx)
    expect(expiredIdx).toBeLessThan(eventCheckIdx)
  })

  it('the event insert is the last statement before the final new-redemption return', () => {
    const eventInsertIdx = sql.indexOf('insert into public.traveller_analytics_events')
    const finalReturnIdx = sql.indexOf(
      "return jsonb_build_object('redemption_id', v_redemption_id, 'redeemed_at', now(), 'already_redeemed', false);",
    )
    expect(eventInsertIdx).toBeGreaterThan(-1)
    expect(finalReturnIdx).toBeGreaterThan(eventInsertIdx)
  })

  it('preserves the real, distinctive guards from the shipped R12.0 body verbatim', () => {
    expect(sql).toContain("if v_staff is null then raise exception 'unauthorized' using errcode = '42501'; end if;")
    expect(sql).toContain('for update;')
    expect(sql).toContain("raise exception 'forbidden' using errcode = '42501';")
    expect(sql).toContain("raise exception 'bad_amount_spent';")
    expect(sql).toContain("raise exception 'amount_spent_required';")
  })

  it('preserves the function as security definer with search_path pinned', () => {
    expect(sql).toContain('security definer set search_path = public')
  })
})
