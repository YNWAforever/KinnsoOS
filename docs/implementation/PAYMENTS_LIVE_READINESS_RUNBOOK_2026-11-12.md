# Payments live-readiness runbook (P5)

**Status:** engineering is ready for live keys; production is intentionally inert (payments flag off, provider `none`, no webhook secret, zero payment rows). Turning on real money is an owner-run step that needs the KYC/legal items below. Nothing in this runbook moves money until step 6.

## Owner prerequisites (only the owner can complete)

1. **Stripe account** in Kinnso's name: complete KYC, name the payout bank account, and confirm the account country. (Decision P7: Kinnso owns the account.)
2. **Live API keys** stored in Vercel production as `STRIPE_SECRET_KEY` (never in the repo, never in a client bundle) and confirm `KINNSO_PAYMENTS_PROVIDER=stripe`.
3. **Live webhook endpoint**: Stripe Dashboard → Developers → Webhooks → add `https://kinnso-os.vercel.app/api/payments/webhook` with events `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`; copy the signing secret to Vercel as `KINNSO_PAYMENTS_WEBHOOK_SECRET`.
4. **Cancellation policy text** for the post-acceptance window (before acceptance is already full refund per decision P4) and who handles disputes.
5. **Legal entity name/country and tax position** (no tax engine in v1 per decision P5; invoices are Stripe receipts).
6. **Payout cadence** confirmed (monthly, no minimum per decision P3) and the manual payout owner.

## Engineering readiness in this release

- Provider adapter `stripe` creates hosted Checkout Sessions server-side and refunds the stored payment intent with an `Idempotency-Key` of `refund_<paymentId>`; the fake adapter is used locally and in the current production (inert).
- Refunds now call the provider first and record only a provider-accepted refund (`kinnso_ops_record_refund`), storing the provider refund id in `booking_payments.provider_refund_id` and the audit event. A second record for the same payment is refused, so a retried provider call cannot double-refund.
- The ops payments dashboard shows provider/webhook readiness, money states, the payment list, the audit trail and the ingested provider-event ledger.
- The webhook endpoint verifies `Stripe-Signature` over the raw body (5-minute tolerance), is replay-safe via `provider_event_id`, and refuses to run without the signing secret.
- The 7-day payment deadline is now swept automatically: `GET /api/cron/payment-expiry` with `Authorization: Bearer <CRON_SECRET>`, same-origin, expires both `requires_payment` and abandoned `processing` checkouts, writes one `payment.expired` event per payment, and is idempotent. The same sweep is available to an operator from the payments dashboard ("Sweep overdue windows") for immediate runs.

## Scheduled expiry sweep

The production scheduler already calls the other cron routes (email outbox every 15 minutes, health, retention) with the `CRON_SECRET` bearer and the site origin. Add one more entry:

- **URL:** `https://kinnso-os.vercel.app/api/cron/payment-expiry`
- **Method/headers:** `GET`, `Authorization: Bearer <CRON_SECRET>`; the request must originate from the production site origin (the endpoint refuses foreign origins).
- **Cadence:** every 15 minutes (or hourly); the sweep is idempotent and cheap (indexed deadline scan).
- **Without the credential:** the endpoint is a no-op that reports `cron-secret-not-configured`; a wrong credential is `401`, a foreign origin `403`.
- **Manual fallback:** the payments dashboard "Sweep overdue windows" button calls the ops-only route with the operator's session.

If the scheduler is missing, unpaid accepted trips stay `awaiting_payment`/`processing` past the 7-day deadline; the manual button clears them, but the scheduler is the required posture.

## Enablement sequence (owner-run, one at a time)

1. Set the two Vercel env vars above for **Production** and redeploy (or promote a deployment that has them). Do not enable the flag yet.
2. Verify readiness: `/ops?view=payments` shows provider `stripe`, "provider configured", webhook secret configured, and the flag still off. The `/api/ops/payments` GET must show `providerConfigured:true` and `webhookConfigured:true`.
3. Run a **Stripe test-mode** end-to-end first (test keys in a preview/staging deployment, real fake-free flow): create a priced booking, pay with test card 4242…, confirm the webhook lands once, the payment row is `paid` with a `pi_…` intent, and a test refund returns a `re_…` id shown in the audit trail.
4. Switch to live keys and repeat the same read-only checks; the provider must report `stripe` and configured.
5. Enable payments in the ops dashboard (or POST `{enabled:true}` via the ops UI action). This is the first money-visible state change.
6. **First real low-value transaction** by the owner: book the cheapest priced guide, pay with a real card, confirm the payment and webhook, then refund it from the ops dashboard and confirm the audit trail and Stripe refund id. Keep the amount at the platform minimum (HK$1.00).
7. Reconcile: Stripe Dashboard payments for the test period = `paid` rows in the ops dashboard; any difference is investigated before the next day.
8. Announce/launch; monitor the provider-event ledger daily for ignored events (`amount_mismatch`, `late`, `payment_not_found`).

## Rollback

- **Disable the flag** (ops dashboard button or `PUT /api/ops/payments {enabled:false}`). Paid UI disappears and new checkouts refuse; existing paid bookings stay readable; no money moves.
- **Remove the webhook secret** (and/or live key) and redeploy: the endpoint returns `503 not_configured` and checkout refuses. Provider events already ingested remain in the ledger.
- **Refund** any affected paid booking from the ops dashboard (audited) instead of deleting rows; the ledger and provider remain the reconciliation source.
- If Stripe itself is misconfigured, delete the live webhook endpoint in the Stripe Dashboard first, then rotate the secret in Vercel.

## Known limits at enablement

- Refunds are only issued through the ops dashboard (outbound). A refund created directly in the Stripe Dashboard is not yet ingested; reconcile it manually and prefer the dashboard path.
- The payments list shows the latest 100 rows and the provider ledger the latest 50; this is enough for the first live transactions but needs pagination before real volume.
- Refund notifications to travellers/creators are not sent yet (cancellation messaging is pending the owner's policy text).
- Payouts are manual bank transfers per decision P3; no automated transfer code exists.
- Signature-failure attempts are not persisted by design; repeated failures are visible in Stripe's webhook delivery log and server logs, not in our ledger.
