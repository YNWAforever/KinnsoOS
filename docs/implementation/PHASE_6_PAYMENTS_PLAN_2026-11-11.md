# Phase 6 — paid surfaces: implementation plan

**Status:** planning only. No payment code is written, deployed or enabled by this document. Email is paused (adapter ready, credentials pending); this plan does not depend on it.

**Baseline:** the free request-to-book flow is live (request → creator accepts/declines → completion), with one booking table, in-app notifications, and an ops control plane. Phase 6 adds money to the accepted step.

**Planning defaults** (from `PAID_SURFACES_DECISION_PACK_2026-11-10.md` §8, used only to make the plan concrete — each is still an owner decision and each change reshapes the plan):

| Decision | Planning default | Changes if different |
|---|---|---|
| P1 booking model | **B — pay after the creator accepts** (accepted → awaiting payment → paid/confirmed) | Model A (pay at request) moves the payment before the creator decision and inverts the state machine |
| P2 provider / MoR / currency | **Stripe, Kinnso as merchant of record, HKD** | Stripe-as-MoR simplifies payouts/tax but removes Kinnso from the money relationship; multi-currency adds FX and rounding |
| P3 commission / payouts | **15% commission, monthly payouts** | Changes ledger math, payout tables and reporting only |
| P4 cancellation / disputes | full refund before acceptance; after acceptance per policy; **Kinnso owns disputes** | Changes refund authority and the ops surface |
| P5 legal entity / card data | entity named by owner; **card data hosted by the provider**, never in our DB | A different entity changes the Stripe account and payout bank |

## 1. Goals and non-goals

**Goals (S6b):** a traveller can pay for an accepted trip with a card through a hosted checkout; the creator sees the trip confirmed and the payout accruing; ops can see money state and issue refunds with an audit trail; the database remains the source of truth for booking state.

**Non-goals for the first paid release:** card data in our systems, subscriptions, multi-currency, stored payment methods, split payments to multiple creators, tax engines, invoicing beyond provider receipts, automated payouts (first release can be provider-dashboard payouts with our ledger as the record).

## 2. State machine

```
requested ──accept──► accepted ──pay──► paid ──trip ends──► completed
    │                    │  │
    └──decline──► declined│  └──payment window expires──► payment_expired
                          └──creator cancels──► refunded/cancelled
```

Rules to encode:
- Only `accepted` can enter payment; the accept step creates a payment intent with a deadline (default 7 days).
- `paid` sets the trip confirmed; completion (B1) already exists and now applies to paid, completed trips.
- Expiry is a scheduled sweep, not a UI-only state.
- Refund transitions require an actor (ops) and a reason; money movement is provider-executed, our ledger mirrors it.

New booking statuses: `awaiting_payment`, `paid`, `payment_expired`, `refunded`. Existing statuses unchanged; all transitions remain security-definer RPCs.

## 3. Data model (migration draft)

Service-role only tables; no client grants; RLS enabled:

```sql
-- one row per accepted booking that must be paid
create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null unique references public.booking_requests(id) on delete cascade,
  creator_id uuid not null references public.creators(id),
  traveler_user_id uuid not null references auth.users(id),
  amount_minor integer not null check (amount_minor > 0),        -- HKD cents
  currency char(3) not null default 'HKD',
  commission_minor integer not null default 0,                    -- snapshot at payment time
  status text not null default 'requires_payment'
    check (status in ('requires_payment','processing','paid','refunded','expired','failed')),
  provider text not null default 'stripe',
  provider_payment_intent_id text unique,
  provider_checkout_session_id text unique,
  paid_at timestamptz,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- append-only audit; one row per provider event or ops action
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  booking_payment_id uuid references public.booking_payments(id) on delete cascade,
  provider_event_id text unique,          -- makes webhook handling idempotent
  kind text not null,                     -- checkout.completed, refund, dispute, expiry...
  payload jsonb not null default '{}'::jsonb,  -- provider ids/status only; no card data
  created_at timestamptz not null default now()
);

create table public.creator_payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id),
  period_start date not null,
  period_end date not null,
  gross_minor integer not null,
  commission_minor integer not null,
  net_minor integer not null,
  status text not null default 'accruing' check (status in ('accruing','scheduled','paid','adjusted')),
  provider_transfer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Price source: today guides have no price field. The first paid release needs **creator-set prices** (guide base price or per-day), which is a small additional migration and a creator UI — flagged as a dependency below.

## 4. Runtime architecture

```
traveller                   Next.js API                      Stripe (hosted)
   │ create checkout ─────►  POST /api/payments/checkout
   │                         ├─ RPC: assert accepted + owner, create booking_payments row
   │                         └─ create Checkout Session (server-side)  ──► redirect URL
   │  pays on Stripe ◄───────────────────────────────────────────────┘
   │                         POST /api/payments/webhook  ◄──── signed event
   │                         ├─ verify signature (raw body)
   │                         ├─ insert payment_events (unique provider_event_id)
   ├─ poll booking status ◄─ ├─ RPC: mark paid (idempotent, one-way)
                              └─ enqueue in-app/email confirmation (reuse outbox)
```

Design constraints, consistent with the current codebase:
- **No card data and no Stripe.js card form in our origin**: hosted Checkout redirect keeps us at PCI SAQ A.
- Webhook verification uses the raw request body and `Stripe-Signature`; the secret is env-only. Webhooks are idempotent by `provider_event_id` (unique constraint) and replayed safely.
- Every state change is an RPC with `search_path=''`, `security definer`, explicit grants, and an `amount`/`owner` re-check server-side — never trust the browser.
- A provider adapter seam mirroring email: `stripe` + `fake` (local), selected by env; the fake adapter lets the whole flow run locally without an account, exactly like the email `console` adapter.
- Money math in **integer minor units** only; commission snapshotted at payment time so later rate changes cannot rewrite history.
- Default-off: `KINNSO_PAYMENTS_ENABLED` unset/false makes every paid surface invisible and every payment RPC reject.

## 5. Slices

| Slice | Content | Ledger | Verification |
|---|---|---|---|
| P0 | Decision record + Stripe **test-mode** account, keys in Vercel (test), webhook secret | — | no user-visible change |
| P1 | Price fields + creator price UI, payment tables, state machine RPCs (inert), 7-day expiry sweep | ~269 | RPC tests: illegal transitions rejected, owner checks, amount snapshot, expiry |
| P2 | Fake-provider checkout locally + hosted checkout redirect + pay UI on accepted trips | ~270 | local E2E: accept → pay → booked/confirmed, expiry path, double-pay impossible |
| P3 | Webhook endpoint + idempotent ledger + confirmation notifications | ~271 | replay duplicate webhook → one event; signature failure 400; fake-provider invoice paid locally |
| P4 | Ops payments dashboard: money states, refund action with audit, failed webhook visibility | ~272 | ops E2E: refund requires reason, shows in audit, booking moves to refunded |
| P5 | Live readiness: Stripe live keys, MoR/KYC/tax confirmed, payout cadence manual, runbook + rollback, first real low-value transaction | — | owner-run live test, reconciliation |

Estimates: P1–P2 ≈ 3–4 focused days; P3 ≈ 2; P4 ≈ 2; P5 is owner-led and gated on KYC/legal.

## 6. Security, compliance and ops

- **PCI:** hosted Checkout only; no card fields, no PAN/CVC in logs or DB. Provider receipt and dollar amounts are the only money data we see.
- **Webhook:** signature verification, raw-body handling, replay-safe ledger, 5-minute tolerance, alert on repeated verification failures.
- **Authorization:** pay only your own accepted booking; refund only ops with a reason; creator sees only their own payouts; no client can write payment tables.
- **Audit:** append-only `payment_events`, immutable amount/commission snapshots, every refund tied to an actor.
- **Reconciliation:** daily check that paid bookings = provider payment count for the period; ops health gains a `payments` aggregate (pending payments, overdue checkouts, failed refunds).
- **Rollback:** disable flag → paid UI disappears, checkout creation rejects; existing paid bookings remain readable; no money is moved by rollback.
- **Data rights:** payments are included in account export/deletion policy (deletion must retain legally required transaction records — provider holds receipts; our ledger keeps minimal records).

## 7. Dependencies and questions for the owner

Before P1 can start:

1. **Prices:** who sets them — creator per guide (including per-day?), or a platform price? Is there a minimum?
2. **Commission:** exact % and who absorbs provider fees; payout cadence (monthly?) and minimum payout.
3. **Cancellation matrix:** exact refund rules before/after acceptance, creator cancellation, no-show; who decides edge cases.
4. **MoR and legal:** entity name, Stripe account country, tax handling (Stripe Tax? none for v1?), invoicing required?
5. **Card data:** confirm provider-hosted only (recommended; no stored cards in v1).
6. **Test/live:** who owns the Stripe account and can complete KYC.

## 8. Recommendation

Approve the **planning defaults** (model B, Stripe, Kinnso MoR, HKD, 15%, monthly payouts, provider-hosted card data) as the working assumptions, then answer §7 so P1 can begin. P1–P2 can be built and tested entirely in Stripe test mode plus a local fake adapter with zero money at risk; live keys only at P5.

Email is not a blocker for this plan; when its credentials arrive, P3's confirmation notifications can reuse the existing outbox. Reminders stay read-time until then.
