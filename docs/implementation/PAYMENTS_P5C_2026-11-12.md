# Phase 6 P5c — scheduled expiry sweep for payment windows

**Status:** deployed and verified in production, inert (flag off, provider `none`, no webhook secret, no rows). Release `5e83954`, ledger **275** (`20261111170000`), deployment `dpl_2L9iyjtJ5nmD7Zrixvxk4PHpepnv`. The sweep is wired end to end; the production scheduler entry is the remaining owner step.

## What shipped

- **The missing deadline sweep.** P1 created `kinnso_internal.expire_payment_windows()` (7-day deadline → payment `expired`, booking `payment_expired`, one `payment.expired` ledger event) but nothing ever called it, so an unpaid accepted trip could stay `awaiting_payment` forever. A narrow `public.kinnso_payment_sweep_expired()` caller now exposes it to the service role (scheduler) and active operators only; the internal function stays locked down.
- **A real gap fixed in the same function.** The old sweep only expired `requires_payment`; a traveller who opened and abandoned the hosted checkout (`processing`) could hold a trip past the deadline indefinitely. Both unpaid states now expire; the overdue-checkouts count in the dashboard therefore drains.
- **Scheduler endpoint.** `GET /api/cron/payment-expiry` runs without a user session, is gated by `CRON_SECRET` and the site origin, is a no-op when the scheduler credential is unset, refuses foreign origins, and reports `{expired}`. It is idempotent: only past-deadline rows change and each payment gets at most one expiry event.
- **Manual operator fallback.** `POST /api/ops/payments/sweep` (ops session, same-origin, role-checked twice) plus a "Sweep overdue windows" button on the payments dashboard. This is what an operator uses if the scheduler is late or missing.
- **Cron-auth origin fix.** `cronAccess` now takes the origin from the `Host` header (with `x-forwarded-proto` when proxied) instead of `request.url`, which Next normalises to an internal host under `next start`. All cron routes (email outbox, health alert, retention, and now payment expiry) are callable from the real site origin again.
- **Runbook.** The live-readiness runbook now specifies the scheduler entry (URL, method, bearer credential, 15-minute cadence) and the manual fallback.

## Verified

- **Local 24/24** against the public-it database and a production build: the earlier P5a paid/webhook/refund/readiness flow; scheduler without credential 401; authorized sweep expires an abandoned `processing` checkout (`expired` + `payment_expired` + exactly one `payment.expired` event); repeat sweep 0; dashboard shows `已過期 1` and the manual sweep reports 0; traveller 403; pause/resume; clean residue.
- **Unit/gates:** 2,126 unit tests (2,124 pass, 2 skipped, 0 fail), including 7 new route/authorization tests for the sweep; `tsc --noEmit` clean; ESLint 0 errors on changed files; production build exit 0; packaged-source Python suite 12 tests OK (1 skipped).
- **Production database:** ledger 274/`20261111160000` → **275**/`20261111170000` in one guarded transaction (baseline `PAYMENTS_P5C_BASELINE_CHANGED` checks, post checks, ack `KINNSO_COMMIT_ACK_PAYMENTS_P5C_20261112`); wrapper function created, grants only `authenticated` + `service_role` (anon 0), internal function widened but not callable by `authenticated`; flag still false, 0 payments, 0 events, 8 published guides.
- **Production read-only 15/15:** health; anonymous dashboard 401 and anonymous refund 403; empty surfaces with `provider:'none'`, `providerConfigured:false`, `webhookConfigured:false`; detail/refund 404 without writes; unauthenticated scheduler 401; operator manual sweep returns `{expired:0}`; dashboard shows `已過期 0`, the readiness line and the new sweep control; traveller 403; second read confirms nothing was written; alias serves the promoted deployment.
- **CI:** run `43088446899` for the preceding receipt commit passed `verify` and `operations-performance`; the same four runner-image jobs (`connected`, `auth-mailbox`, `workspace-fixtures`, `studio-planning`) fail at their first step on `CI_MIRROR_UNSUPPORTED_UBUNTU_IMAGE`, unrelated to this change. The `5e83954` run was still in progress at receipt time.

## Limits

- **The scheduler entry is not created automatically.** There is no in-repo scheduler configuration (like the other cron routes, production calls them from the owner-configured scheduler with `CRON_SECRET`). Until the owner adds the payment-expiry entry, the sweep only happens when an operator presses the dashboard button. The runbook has the exact entry.
- **Expiry sends no notification.** With the email provider off and no expiry inbox copy, the traveller/creator see the expired state in the request lists but receive no message; that belongs with the cancellation-policy work.
- Payments itself is still inert: flag off, provider `none`, no live Stripe account, no webhook secret. Live money remains owner-gated (see `PAYMENTS_LIVE_READINESS_RUNBOOK_2026-11-12.md`).
