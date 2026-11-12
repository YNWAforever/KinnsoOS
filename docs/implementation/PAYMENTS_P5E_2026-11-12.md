# Phase 6 P5e — provider-side refund reconciliation

**Status:** deployed and verified in production, inert (flag off, provider `none`, no webhook secret, no rows). Release `e513ce9`, ledger **277** (`20261111190000`), deployment `dpl_AHaxYzTnGoKByHfE9zQufqVaW6LP`.

## What shipped

Refunds created in the ops dashboard are provider-first and audited (P5a), but a refund created **directly in the Stripe Dashboard** previously left our payment at `paid` until someone noticed. The signed webhook now reconciles those:

- **`charge.refunded` is supported.** The event reduction extracts the payment intent, refund id, refunded amount and refunded flag; a new service-role-only RPC (`kinnso_payment_refund_ingest`) resolves the payment from its stored payment intent (a Charge has no `client_reference_id`).
- **A full refund flips state exactly once**: payment and booking move to `refunded`, `provider_refund_id` stores the provider refund id, and one `payment.refunded` audit event records `reason: provider_refund`, `source: webhook`, amount, currency and provider refund id. The existing `provider_event_id` unique key makes retries replay-safe.
- **Uncertain refunds never guess.** Partial refunds (`partial_refund`), over-refunds (`amount_mismatch`), currency mismatches, unknown payment intents, missing refund fields, provider mismatches and duplicate refunds are recorded as audited ignore rows (`ignored` in the payload) and change no state; unknown intents are stored as unlinked ledger rows so ops can reconcile.
- **One expiry rule.** The P5d per-payment expiry was extracted into `kinnso_internal.expire_payment()` so the sweep, the scheduler route and the fake-confirm "deadline already passed" path all emit the same `payment.expired` event and the same traveller/creator notices (previously the fake path expired silently).
- **Index + safety**: an index on `(provider, provider_payment_intent_id)` supports intent lookup; the refund RPC is granted only to `service_role` (authenticated/anon refused), the internal expiry helper stays revoked, and the webhook route stays inert with no signing secret.
- **Runbook** lists `charge.refunded` in the Stripe webhook subscription and explains reconciliation behaviour.

## Verified

- **Local 14/14** against the public-it database and a production build: external full refund resolves by intent and flips both states once with the audit event; replay is idempotent (one event); partial refund stays paid and is audited; unknown intent recorded unlinked; a later full refund reconciles the partial case; duplicate external refund audited `already_refunded`; missing refund fields audited; unsigned webhook 400; ops dashboard shows 2 reconciled refunds with the provider refund id; fake confirm after the deadline expires through the notice path with both inbox notices; clean residue (no rows, no unlinked events, flags off).
- **Unit/gates:** 2,130 unit tests (2,128 pass, 2 skipped, 0 fail) including three new webhook cases (charge-refund reduction, refund-specific RPC path, audited ignore); `tsc --noEmit` clean; ESLint 0 errors; production build exit 0; packaged-source Python suite 12 tests OK (1 skipped).
- **Production database:** ledger 276/`20261111180000` → **277**/`20261111190000` in one guarded transaction (ack `KINNSO_COMMIT_ACK_PAYMENTS_P5E_20261112`); refund RPC exists with service-only grant (authenticated/anon 0), intent index present, per-payment expiry extracted and the sweep/fake-confirm aligned, flag still false, 0 payments/events, 8 published guides.
- **Production read-only 16/16:** health; **webhook inert without a signing secret (503)**; anonymous dashboard 401 and refund 403; empty surfaces (`provider:'none'`, `providerConfigured:false`, `webhookConfigured:false`); 404 probes write nothing; unauthenticated scheduler 401; operator sweep `{expired:0}`; dashboard/readiness/sweep control render; traveller 403; second read unchanged; alias serves `dpl_AHaxYzTnGoKByHfE9zQufqVaW6LP`.

## Limits

- **Partial refunds are audited, not applied.** A partial refund leaves our payment at `paid` with an `ignored: partial_refund` ledger row; the runbook requires manual reconciliation (the payment model is full-refund only in v1).
- **Provider refunds do not notify the traveller/creator.** The paid and expiry notices exist; a "your refund was processed" notice does not (still tied to the pending cancellation policy work).
- **Refunds after a trip is completed** move the payment to `refunded` but leave the booking status unchanged (only `paid` bookings flip to `refunded`); the audit event still records the money.
- **Stripe subscription required**: the live webhook endpoint must include `charge.refunded`; without it the endpoint stays silent about dashboard refunds.
- Payments remains inert: flag off, provider `none`, no live Stripe account, no webhook secret, no real money moved. Live enablement is owner-gated (`PAYMENTS_LIVE_READINESS_RUNBOOK_2026-11-12.md`).
