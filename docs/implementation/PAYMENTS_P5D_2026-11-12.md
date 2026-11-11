# Phase 6 P5d — expiry notices for travellers and creators

**Status:** deployed and verified in production, inert (flag off, provider `none`, no webhook secret, no rows). Release `30d8b0f`, ledger **276** (`20261111180000`), deployment `dpl_GHEMUuePhKNCaJoZx1rrPWbHcHKP`.

## What shipped

P5c made overdue payment windows expire automatically, but the transition only wrote the payment ledger — a traveller's trip could be cancelled and a creator's dates freed with no notice. This slice emits the notices from the same authoritative transaction:

- **Traveller notice** `booking.payment_expired` ("付款期限已過，預訂已取消") and **creator notice** `booking.payment_window_expired` ("旅客未在期限內付款，預訂已取消"), each inserted into the in-app inbox inside `expire_payment_windows()` together with the status change and the `payment.expired` ledger event.
- **Mutes are honoured** exactly like the paid notices: a muted recipient gets neither the inbox row nor the email.
- **Email outbox rows** are queued in the same transaction (both new types are allowed by the outbox constraint) with the guide title, dates, party size and attempted amount, so enabling the email flag later does not change expiry behaviour. With the flag off nothing is queued.
- **Vocabulary and copy**: inbox/mute/email constraints widened, the mute settings response now offers nine notice types, bilingual email templates (`/requests` for travellers, `/studio` for creators), inbox heading labels and mute-settings labels added.
- **Provider-side checkout expiry** (`checkout.session.expired`) stays audit-only in the webhook, unchanged: the sweep remains the single authority that changes states and emits notices, so a late provider event cannot double-notify.

## Verified

- **Local 29/29** against the public-it database and a production build: the full P5c flow plus notice assertions — one traveller inbox + one creator inbox row, one queued email each with the guide title/status/amount, nine mute entries including both new types, a muted creator receives neither inbox nor email while the traveller still does, both inbox pages render the localized notice, refunds/dashboard/gates unchanged, clean residue (no rows, no outbox, both flags off).
- **Unit/gates:** 2,127 unit tests (2,125 pass, 2 skipped, 0 fail) including two new expiry-template cases; `tsc --noEmit` clean; ESLint 0 errors on changed files; production build exit 0; packaged-source Python suite 12 tests OK (1 skipped).
- **Production database:** ledger 275/`20261111170000` → **276**/`20261111180000` in one guarded transaction (ack `KINNSO_COMMIT_ACK_PAYMENTS_P5D_20261112`); inbox/mute/email-outbox vocabularies include both types, mute list and sweep notice emission verified via catalog; flag still false, 0 payments, 0 events, 0 queued emails, 8 published guides.
- **Production read-only 15/15:** health; anonymous 401/403; empty surfaces (`provider:'none'`, `providerConfigured:false`, `webhookConfigured:false`); 404 probes write nothing; unauthenticated scheduler 401; operator sweep `{expired:0}`; dashboard/readiness/sweep control render; traveller 403; second read unchanged; alias serves `dpl_GHEMUuePhKNCaJoZx1rrPWbHcHKP`.

## Limits

- **Email delivery still needs the provider decision.** The outbox rows are only queued while the email flag is on, and production has the flag off and no provider, so the expiry email will not actually send until the owner completes the email activation (`EMAIL_ACTIVATION_RUNBOOK_2026-11-11.md`). In-app notices are live immediately when a window expires after enablement.
- **No advance reminder.** The notice fires at expiry, not before the deadline; a "your window ends soon" reminder is not implemented.
- **Only swept expiries notify.** A provider checkout expiry event (`checkout.session.expired`) remains audit-only; if a hosted-checkout session dies early, the traveller/creator learn when the 7-day deadline sweep runs, not when Stripe reports it.
- Payments is still inert: flag off, provider `none`, no live Stripe account, no webhook secret. Live money remains owner-gated (`PAYMENTS_LIVE_READINESS_RUNBOOK_2026-11-12.md`).
