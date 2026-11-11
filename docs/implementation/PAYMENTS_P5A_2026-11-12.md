# Phase 6 P5a — provider refunds and the live-readiness surface

**Status:** deployed and verified in production, inert (flag off, provider `none`, no webhook secret, no rows). Release `518e882`, ledger **274** (`20261111160000`), deployment `dpl_DMPkx32RPB6odLL2p3drKDbZ2H68`. Live money still needs the owner-run prerequisites in the runbook.

## What shipped

- **Provider refunds**: `PaymentAdapter` now has a `refund` operation. The fake adapter returns a stable local `re_fake_…` id (no money moves); the Stripe adapter refunds the stored payment intent via `POST /v1/refunds` with an `Idempotency-Key` of `refund_<paymentId>`, accepting `succeeded` and `pending` statuses and never echoing the secret key. A refund is now provider-first: the API reads an ops-only refund context (`kinnso_ops_refund_context`: provider, intent, amount, currency, status), calls the provider, then records the accepted refund through `kinnso_ops_record_refund`, which stores the provider refund id, moves payment/booking to `refunded`, and writes the audit event. A second record for the same payment is refused, so a retried provider call can never double-record.
- **Readiness surface**: the payments dashboard shows the webhook-secret state next to the provider/flag state; the API payload adds `webhookConfigured`. Provider refund ids appear in the payment list/detail and in the dashboard audit trail.
- **Live-readiness runbook** (`docs/implementation/PAYMENTS_LIVE_READINESS_RUNBOOK_2026-11-12.md`): the owner prerequisites (Stripe account/KYC, live keys, live webhook endpoint + signing secret, cancellation text, entity/tax, manual payout owner), the test-mode-first enablement sequence, first low-value live transaction steps, reconciliation, rollback and known limits.

## Verified

- **Local 18/18** against the public-it database and a production build: paid fake checkout; signed webhook mismatch accepted and visible; dashboard money states, rows, provider ledger and webhook-secret readiness; reason-gated refund through the provider adapter (fake) recording `provider_refund_id` matching the audit event and the payment detail; traveller 403, short reason 400, anonymous 401; pause/resume; clean residue.
- **Unit/gates:** 2,119 unit tests (2,117 pass, 2 skipped, 0 fail) including new provider refund cases (fake id stability, Stripe refund form/auth/idempotency header, pending status, failure without key echo, malformed responses) and updated refund-route cases (provider-first order, provider mismatch, unconfigured provider, error mapping); `tsc --noEmit` clean; ESLint 0 errors on changed files; production build exit 0; packaged-source Python suite 12 tests OK (1 skipped).
- **Production database:** ledger 273/`20261111150000` → **274**/`20261111160000` in one guarded transaction (baseline, catalog and post checks; `KINNSO_COMMIT_ACK_PAYMENTS_P5_20261112`); `booking_payments.provider_refund_id` added; refund context/recorder RPCs created with authenticated-only grants (anon 0); list/detail read models include provider refund ids; flag still false, 0 payments, 0 provider events, 8 published guides.
- **Production read-only 12/12:** health up; anonymous GET 401 and anonymous refund 403; operator payload empty with `providerConfigured:false`, `webhookConfigured:false`; detail lookup and refund for a missing payment return 404 without changing anything; dashboard renders zero counts and the readiness line shows the webhook secret missing; no rows or provider events; traveller 403; second read confirms nothing was written; alias serves the promoted deployment.

## Limits

- **No live Stripe account exists yet.** KYC, live keys and the live webhook secret are owner-run steps (P5 in the plan); this release makes the code path ready and verifies it against a stand-in Stripe API plus the fake provider, but no real Stripe charge or refund has been executed.
- Refunds initiated directly in the Stripe Dashboard are not ingested by our webhook yet; the runbook requires refunds to go through the ops dashboard and reconciles anything else manually.
- Refund notifications to travellers/creators are still not sent (cancellation messaging awaits the policy text).
- The payments list remains capped at the latest 100 with no cursor UI; the dashboard is request/refresh driven.
- Payouts remain manual bank transfers; no automated payout or settlement code exists.

## CI note

The `Journeys` run for `518e882` was not yet reported at receipt time; the preceding receipt commit `de4f336` shows the same pattern as P3/P4 — `verify` and `operations-performance` pass, while `connected`, `studio-planning`, `workspace-fixtures` and `auth-mailbox` fail in their first step on the owned-runner image (`CI_MIRROR_UNSUPPORTED_UBUNTU_IMAGE`), unrelated to this change.
