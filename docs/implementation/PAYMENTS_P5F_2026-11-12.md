# Phase 6 P5f — final-24h payment reminder

**Status:** deployed and verified in production, inert (flag off, provider `none`, no webhook secret, no rows). Release `0bf5e1c` (feature `4040f12`), ledger **278** (`20261111200000`), deployment `dpl_F7e5orDkeRiyovAVkMfT4MtFvZ6M`.

## What shipped

P5c/P5d expire and announce overdue windows; a traveller who simply forgot still lost the trip without warning. The same scheduler entry now also reminds inside the final 24 hours:

- **One reminder per payment**, inside the last 24 hours of the unpaid window: an in-app `booking.payment_deadline_soon` notice plus a queued email (only when the email flag is on), both honouring the traveller's mute. `booking_payments.reminder_sent_at` is set in the same statement that returns the row, so the rule is idempotent.
- **`GET /api/cron/payment-expiry` runs both rules** and reports `{configured, expired, reminded}`; it still refuses without the scheduler credential / foreign origin and stays a no-op without `CRON_SECRET`.
- **The ops dashboard manual control now runs both rules** and is renamed "Run payment window checks" / 「檢查付款期限」; it reports `{expired, reminded}`.
- Vocabulary widened for the new event type across inbox, mutes and email outbox; mute list now has ten types and the reminder can be muted like the others.
- Indexed deadline scan (`deadline_at where reminder_sent_at is null and status in ('requires_payment','processing')`).

## Verified

- **Local 9/9**: an open checkout inside the final 24h gets one in-app + queued email reminder from the scheduler; a muted traveller gets neither while `reminder_sent_at` still records the send; paid payments are never reminded; repeats report `reminded: 0`; the manual ops run sends and reports both counts; dashboard/list intact; clean residue (no bookings/payments/events/outbox/inbox, mutes cleared, flags off).
- **Unit/gates:** 2,132 unit tests (2,130 pass, 2 skipped, 0 fail) with updated scheduler tests (both counts, failing reminder → 503) and ops manual tests plus a new template test; `tsc --noEmit` clean; ESLint 0 errors (9 pre-existing hook warnings); production build exit 0; packaged-source Python suite 12 tests OK (1 skipped).
- **Production database:** ledger 277/`20261111190000` → **278**/`20261111200000` in one guarded transaction (ack `KINNSO_COMMIT_ACK_PAYMENTS_P5F_20261112`); reminder column + RPC present (service/authenticated, anon refused, internal helper revoked), vocabularies widened (inbox/mute/email), index present, payments and email flags still false, 0 payments/events/queued emails, 8 published guides.
- **Production read-only 16/16:** health; webhook inert (503); anonymous dashboard 401 / refund 403; empty money surfaces (`provider:'none'`, `webhookConfigured:false`); 404 probes; scheduler 401; operator lifecycle `{expired:0, reminded:0}`; dashboard renders states; renamed "Run payment window checks" control present; traveller 403; nothing written; alias serves `dpl_F7e5orDkeRiyovAVkMfT4MtFvZ6M`.

## Limits

- **One reminder, no escalation**: there is a single notice inside the final 24 hours; no repeat, no SMS/push, and no reminder earlier in the window by design.
- **Delivery is schedule-dependent**: without the owner's scheduler entry nothing reminds (or expires); the manual control is only a fallback.
- **Reminder email needs the email path**: the email only queues when the email flag is on, and actual sending still depends on the owner's provider configuration (`EMAIL_ACTIVATION_RUNBOOK_2026-11-11.md`).
- **Reminder reaches the traveller** even if the checkout was abandoned without opening it; it is a safe nudge, not proof of intent.
- Payments remains inert: flag off, provider `none`, no live Stripe account, no webhook secret, no real money moved. Live enablement is owner-gated (`PAYMENTS_LIVE_READINESS_RUNBOOK_2026-11-12.md`).
