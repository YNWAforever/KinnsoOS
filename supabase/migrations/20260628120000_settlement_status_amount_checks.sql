-- Settlement integrity: DB-level CHECK constraints that mirror the application-layer
-- validation in validateSettlementUpdate (apps/web/lib/missions/validation.ts).
--
-- Defense-in-depth for updateSettlementAction: arbitrary payment-status strings and
-- negative commission/fee amounts can no longer be persisted, even if a write reaches
-- mission_settlements outside that code path. The `status` column already carries an
-- inline CHECK from 20260617173932_mission_tables.sql, so it is intentionally omitted.
--
-- All targeted columns are nullable and a CHECK evaluates to TRUE on NULL, so existing
-- NULL rows are unaffected. merchant_invoice_status / merchant_payment_status are left
-- unconstrained because their value domain is not modelled in the app layer yet.

alter table public.mission_settlements
  add constraint mission_settlements_creator_payout_status_check
    check (creator_payout_status in ('pending', 'paid')),
  add constraint mission_settlements_kinnso_commission_status_check
    check (kinnso_commission_status in ('pending', 'paid')),
  add constraint mission_settlements_affiliate_commission_status_check
    check (affiliate_commission_status in ('pending', 'paid')),
  add constraint mission_settlements_creator_commission_amount_check
    check (creator_commission_amount >= 0),
  add constraint mission_settlements_kinnso_commission_amount_check
    check (kinnso_commission_amount >= 0),
  add constraint mission_settlements_affiliate_commission_amount_check
    check (affiliate_commission_amount >= 0),
  add constraint mission_settlements_paid_fee_amount_check
    check (paid_fee_amount >= 0);
