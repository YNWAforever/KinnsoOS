# Paid surfaces — decision pack (S6b/S6c)

Prepared: 2026-11-10 · Production: `launch-ready`, ledger 251, request-to-book live with in-app notifications.
This document is the *input* to any payment work. Nothing below is committed code; each section ends with a concrete choice I need from you.

## 1. Where the product already is

- **Request-to-book** (`booking_requests`): travellers request a date, the guide's creator accepts or declines, both sides get in-app notifications, travellers track requests at `/{locale}/requests`. **No money moves anywhere.**
- Existing database scaffolding that payments could reuse: `experiences`, `experience_availability`, `bookings` (with Stripe fields and statuses `pending_payment/confirmed/completed/cancelled/refunded`), `booking_events`, `booking_settlements`, merchant/settlement tables.
- Existing capabilities are env-flagged; payments would ship behind a new capability and stay off until configured.

## 2. Decision 1 — booking model

| Option | What it means | Build cost | Business implication |
|---|---|---|---|
| **A. Keep request-only (no money)** | Nothing to build for payments | none | No revenue; trust stays manual |
| **B. Pay after creator accepts** (recommended first) | Traveller requests → creator accepts → traveller pays within a window or the request expires | medium | Simplest legal/payment surface; no inventory locking; double-accept risk is handled by expiry |
| **C. Instant booking with payment** | Traveller picks an availability slot and pays immediately | high | Needs real availability, holds, refunds on creator cancellation |
| **D. Hybrid** | Instant where availability is published, request elsewhere | high | Most complexity; only worth it at scale |

**Need from you:** A, B, C or D. Recommended: **B**, then C later per experience.

## 3. Decision 2 — payment provider, custody and when money moves

| Choice | Options | Notes |
|---|---|---|
| Provider | **Stripe** (Checkout/Payment Intents, strong HK support) or an alternative (Adyen, Airwallex, PayPal) | Stripe is the lowest-integration-cost default given the existing `stripe_*` columns |
| Who is merchant of record | Kinnso entity, or each creator/merchant connected account | MoR determines who owes tax, handles chargebacks and appears on statements |
| Charge timing | At acceptance (deposit/full), on completion, or split deposit + balance | Earlier charge needs a clear cancellation policy |
| Refund policy | Full refund until N days before, partial after, or creator-defined | Must be written before checkout goes live |
| Currencies | HKD only first, or HKD/USD/SGD/JPY… | The `bookings.currency` check already allows 8 currencies; each adds FX/tax questions |

**Need from you:** provider, MoR model, charge timing, first currency, refund window. Recommended: **Stripe Checkout, Kinnso as MoR, charge after acceptance, HKD first, full refund until 7 days before.**

## 4. Decision 3 — creator/merchant payouts

| Choice | Options |
|---|---|
| Onboarding/KYC | Stripe Connect (platform collects, pays out) vs manual invoices and bank transfers |
| Commission | flat % platform fee, category-based, or creator-tier based |
| Payout cadence | after completion + hold period (recommended), weekly, monthly |
| Statements | per-booking statement + monthly summary; tax fields (HK: none / others: VAT/GST) |
| Minimums/disputes | minimum payout threshold, reserve for chargebacks |

**Need from you:** payout model and commission percentage; whether creators are contractors paid per booking (recommended for launch) or merchants with their own accounts.

## 5. Decision 4 — trust, cancellation and support

- Cancellation matrix (traveller cancels / creator cancels / no-show) with who keeps what.
- Contact exchange after acceptance: we currently do **not** collect contact details; a paid flow needs one (in-product messaging or masked email).
- Dispute/support owner and response time; refund approval authority.
- Insurance/liability position for guided activities.

**Need from you:** the cancellation matrix and who handles disputes (Kinnso support vs creator).

## 6. Decision 5 — legal, tax and data

- **PCI scope:** use provider-hosted checkout so card data never touches Kinnso; this must stay a hard rule.
- Consumer disclosure text (price, fees, cancellation, provider), invoicing/receipts, record retention.
- Contracting entity and jurisdiction; tax registration for the first market.
- Refund and chargeback handling; fraud checks; booking value caps for the pilot.

**Need from you:** entity/jurisdiction and whether the first launch market is Hong Kong only.

## 7. Decision 6 — rollout shape

Recommended staged plan:

| Stage | Scope | Exit criteria |
|---|---|---|
| **S6b-1** | Pay-after-accept for a small allowlist of creators, HKD, Stripe Checkout, manual refunds | one real end-to-end booking in sandbox then one low-value live booking; reconciliation matches |
| **S6b-2** | Availability + instant booking for experiences that publish slots | no double booking under concurrent checkout tests; refund path exercised |
| **S6c** | Automated payouts, statements, tax fields | creator payout statement reconciles to settlement ledger for a full cycle |
| **S6d** | Merchant availability/inbox tooling | merchant can manage slots and requests without support |

Guardrails for every stage: feature flag default-off, provider sandbox first, idempotent webhooks with a ledger, daily reconciliation report, refunds manual until proven, booking value cap during pilot.

## 8. What I need to start S6b-1

1. Booking model: **B (pay after accept)** or your alternative.
2. Provider + MoR + first currency: **Stripe / Kinnso MoR / HKD** or your choice.
3. Commission and payout cadence (or “manual invoices for now”).
4. Cancellation matrix and dispute owner.
5. First-market legal entity and whether card data must stay provider-hosted (**strongly recommended**).

With those five answers I can produce the S6b-1 technical plan (schema delta, webhook ledger, checkout UI, reconciliation) and start building behind a default-off flag.
