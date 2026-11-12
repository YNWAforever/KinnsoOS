# Phase 6 P5g — monthly creator payout accrual

**Status:** deployed and verified in production, inert (flag off, provider `none`, no rows). Release `d69db87`, ledger **279** (`20261111210000`), deployment `dpl_2AR5iGZuSvmjUJyL4prQkVpz8BAF`.

## What shipped

Payments were live-ready but the owner still had no way to know what each creator was owed, or to record that the bank transfer happened. `booking_payments` already stores the 15% `commission_minor` taken at booking time; this slice turns paid bookings into a monthly accrual and records the manual payout:

- **Monthly accrual** per creator and currency: gross (sum of paid amounts), commission (sum of the stored 15%), net, and booking count. **Refunded payments are excluded**, so a payout run after a refund never pays it out.
- **One payout per creator per calendar month**, enforced by a unique database index. The month is normalised server-side, so overlapping ranges cannot double-pay.
- **Recording is an explicit audited action after the money moved**: bank reference (3–200 chars), optional note, amounts snapshotted, `paid_at`, currency and the operator id stored in the existing `creator_payouts` table. A second payout for the same creator/month is refused (`409`).
- **Ops dashboard surface**: a "Creator payouts" card with a month picker, gross/commission/net totals, per-creator rows and a "Record payout" modal; the existing **ops-only API** (`GET/POST /api/ops/payouts`) re-checks the active-ops role and is same-origin for writes.
- RPCs are service/authenticated only, anon refused, and the bank reference is required by a database check before a row can be `paid`.

## Verified

- **Local 9/9**: one paid + one refunded payment produce an accrual of `HK$750.50` gross / `HK$112.58` commission / `HK$637.92` net with count 1 (the refunded payment excluded); the dashboard shows the accrual and records the payout with the bank reference; the stored row is `paid` with the right period, amounts, currency, reference, operator and timestamp; a second payout is refused; the accrual then shows the recorded payout; short references are `400`; traveller `403`, anonymous `401`; clean residue (no bookings/payments/events/payouts/outbox, flags off).
- **Unit/gates:** 2,139 unit tests (2,137 pass, 2 skipped, 0 fail) with 7 new payout-route tests (auth, month validation, accrual, record, same-origin, distinct conflicts); `tsc --noEmit` clean; ESLint 0 errors; production build exit 0; packaged-source Python suite 12 tests OK (1 skipped).
- **Production database:** ledger 278/`20261111200000` → **279**/`20261111210000`; 5 payout columns added, accrual + record RPCs present, anon grants absent, active-ops gate present, unique period index present, `creator_payouts` still 0 rows, payments flag false, 0 payments, 8 published guides. (The guarded wrapper exited nonzero on PowerShell native-stderr noise after committing; the postcheck ledger confirms the transaction committed.)
- **Production read-only 18/18:** previous checks plus **payout accrual needs an ops session (401)** and **operator sees an empty accrual** `{gross:0, commission:0, net:0, count:0}`; webhook still inert, scheduler lifecycle `{expired:0, reminded:0}`, dashboard renders, nothing written, alias serves `dpl_2AR5iGZuSvmjUJyL4prQkVpz8BAF`.

## Limits

- **Accrual, not settlement**: no automated transfer, tax withholding or creator self-serve earnings statement; the owner still transfers manually and records the reference.
- **Refunds after a recorded payout need a manual adjustment** (no clawback/adjustment flow); refunded payments are excluded only if the refund lands before the payout month is recorded.
- **Calendar month by `paid_at` (UTC)**, not by trip date; a payment link created in one month and paid in the next belongs to the payment month.
- **Single currency per payout**: a month mixing currencies is refused (`mixed_currency`) and must be reconciled manually; production is HKD-only in v1.
- Mission/affiliate earnings (`creator_earnings_summary`, `creator_payout_batches`) are a separate older system and are not merged into this booking payout view.
- Payments remains inert: flag off, provider `none`, no live Stripe account, no real money moved. Live enablement is owner-gated (`PAYMENTS_LIVE_READINESS_RUNBOOK_2026-11-12.md`).
