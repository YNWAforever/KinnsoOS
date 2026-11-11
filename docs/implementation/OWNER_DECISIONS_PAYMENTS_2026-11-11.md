# Owner decisions — payments (Phase 6), 2026-11-11

**Source:** owner reply after the Phase 6 plan, echoing the planning defaults and adding: **“P7 … Kinnso”** (Kinnso owns the Stripe account and completes KYC).

| # | Decision | Recorded answer | Notes |
|---|---|---|---|
| P1 | Booking model | **B — pay after the creator accepts** | accepted → awaiting payment → paid/confirmed; 7-day payment window with expiry sweep |
| P2 | Provider / MoR / currency | **Stripe / Kinnso as merchant of record / HKD** | hosted Checkout only; no card data on our origin |
| P3 | Commission / fees / payouts | **15% commission; Kinnso bears provider fees; monthly payouts; no minimum** | commission snapshotted at payment time |
| P4 | Cancellation / disputes | **Full refund before acceptance; policy-defined after acceptance; Kinnso owns disputes** | refund requires an ops actor + reason; P1 records refunds for the fake provider only |
| P5 | Legal entity / tax / card data | **Owner-named entity; no tax engine v1; card data provider-hosted** | entity legal name + country still required at P5 (KYC) |
| P6 | Pricing | **Creator sets a flat price per guide, no platform minimum** | HKD minor units, range 1.00–100,000.00 HKD; nullable = free/unpriced |
| P7 | Stripe account / KYC | **Kinnso** | the owner acts for Kinnso when creating the account and completing KYC |

## What P1a now implements (this release)

- `guides.price_minor` + owner-only `kinnso_creator_set_guide_price` RPC and `PUT /api/creator/guides/[id]/price`.
- Booking statuses for the paid lifecycle (`awaiting_payment`, `paid`, `payment_expired`, `refunded`) alongside the existing ones.
- `booking_payments`, `payment_events` (append-only, unique provider event id), `creator_payouts` — service-role only, no client grants.
- State machine: accept a priced guide under the flag → `awaiting_payment` + payment row (amount, 15% snapshot, 7-day deadline); internal mark-paid (for P3 webhook/local test); expiry sweep; audited ops refund (fake provider only); completion also accepts `paid`.
- `payments` runtime flag defaults **off**; ops toggle and status endpoints exist; production keeps the flag off.

**Verified locally 11/11:** price owner-only + validation, flag-off keeps the free flow unchanged (no payment row), flag-on accept creates the obligation with correct amount/commission/deadline, ops status, mark-paid, refund reason validation + audit, expiry sweep, paid trip completion.

## Still needed before live money (P5)

1. Legal entity legal name/country and Stripe account country.
2. Kinnso completes Stripe account creation + KYC, and names the payout bank.
3. Confirm the cancellation policy text for the post-acceptance window.
4. Confirm no tax engine for v1 (Stripe Tax can be added later).
5. Stripe test-mode keys + webhook secret in Vercel (test) for P2/P3.

## Honest boundaries

- No provider call, no Checkout, no webhook, no pay UI yet; P1 is inert by design and the production flag is off.
- Payouts are a ledger concept only; nothing transfers money in P1.
- The fake-provider refund path is deliberate scaffolding so P4's provider refund can be added without changing the audit trail.
