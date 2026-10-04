import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120300_r12_1_merchant_visits_driven.sql'),
  'utf8',
)

describe('merchant_insights visits_driven widening', () => {
  it('adds a visits_driven key with separate redemptions and attributed_bookings counts', () => {
    expect(sql).toContain("'visits_driven', coalesce((")
    expect(sql).toContain("'redemptions', top50.redemptions")
    expect(sql).toContain("'attributed_bookings', top50.attributed_bookings")
  })

  it('keeps merchant_insights a zero-arg function (pure additive change, no signature change)', () => {
    expect(sql).toContain('create or replace function public.merchant_insights()')
    expect(sql).not.toContain('drop function public.merchant_insights')
  })

  it('scopes both counts to the calling merchant via v_merchant, not another merchant_id', () => {
    // merchant_insights() takes no parameters -- it resolves the caller's own merchant
    // into v_merchant from auth.uid() against merchant_profiles, same as every other
    // key in this function. Both CTEs must reuse that same variable rather than
    // trusting a caller-supplied merchant id. The redemption channel scopes via
    // offer_redemptions.merchant_profile_id directly (no merchant_offers join is needed
    // -- see the CTE's own comment); the booking channel scopes via
    // experiences.merchant_profile_id.
    expect(sql).toContain('orr.merchant_profile_id = v_merchant')
    expect(sql).toContain('e.merchant_profile_id = v_merchant')
  })

  it('does not merge the two counts into one number', () => {
    expect(sql).not.toContain('redemptions + attributed_bookings as')
    expect(sql).not.toMatch(/'visits',\s*r\.redemptions\s*\+\s*r\.attributed_bookings/)
  })

  it('leaves the existing missions_published, per_mission, and totals keys untouched', () => {
    expect(sql).toContain("'missions_published', (")
    expect(sql).toContain("'per_mission', coalesce((")
    expect(sql).toContain("'totals', (")
  })

  it('orders the top-50 truncation subquery before limiting, so LIMIT does not pick an arbitrary/unstable row set', () => {
    // Postgres LIMIT without ORDER BY has no defined row selection. The inner subquery
    // that truncates `combined` to 50 rows must sort by combined activity (redemptions +
    // attributed_bookings) descending immediately before its LIMIT 50, so a merchant with
    // more than 50 qualifying creator/guide rows reliably keeps its actual top performers.
    expect(sql).toContain('order by (redemptions + attributed_bookings) desc\n        limit 50')
  })

  it('computes attributed_bookings independently of offer_claims, from two separately-grouped CTEs combined via FULL OUTER JOIN', () => {
    // The bug this migration fixes: attributed_bookings was previously only reachable
    // through offer_claims, so a booking attributed to a creator/guide who never had a
    // merchant offer claimed was silently dropped. booking_counts must select straight
    // from public.bookings using b.creator_id/b.guide_id, with no join to offer_claims
    // (or to guides, which would only be reachable via offer_claims in the old shape)
    // gating which bookings are visible.
    // Strip `--` comment lines before asserting: the CTE's own explanatory comment
    // mentions "offer_claims" by name (to explain the independence it provides), which
    // would false-positive a raw not.toContain check against the full text.
    const bookingCountsCte = sql
      .slice(sql.indexOf('booking_counts as ('), sql.indexOf('combined as ('))
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(bookingCountsCte).toContain('from public.bookings b')
    expect(bookingCountsCte).toContain('b.creator_id')
    expect(bookingCountsCte).not.toContain('offer_claims')
    expect(bookingCountsCte).not.toContain('join public.guides')

    // redemptions and attributed_bookings must come from two independently-computed
    // CTEs (redemption_counts, booking_counts) joined via FULL OUTER JOIN, so neither
    // channel's presence gates the other's count.
    expect(sql).toContain('redemption_counts as (')
    expect(sql).toContain('booking_counts as (')
    expect(sql).toContain('full outer join booking_counts bc')
  })
})
