# Email delivery E1 — outbox foundation

**Status:** deployed and verified in production, inert by default. Release 46e17f4, ledger **264** (`20261110130000`), deployment dpl_7SyzH2r37ANutrU4S11yacHjPYYx.

## What shipped

- `kinnso_internal.runtime_flags` with `email_outbox = false`; nothing changes for users until an operator enables it.
- `public.email_outbox`: recipient user ids only (no addresses), idempotent per `(recipient, event, entity)`, status/attempts/next-attempt columns, RLS with no client grants.
- The four booking notifiers enqueue beside the inbox event through `kinnso_internal.enqueue_booking_email()`; the helper no-ops while the flag is off and honours the in-app mute as the channel preference for now.
- Ops-gated `kinnso_ops_set_email_outbox()` / `kinnso_ops_email_outbox_status()` and `GET/PUT /api/ops/email/outbox` for staging. Provider is `none`, so no send path exists.

## Verification

- Local 7/7: disabled and empty by default; flag off created no row for a real request; flag on enqueued one pending creator row with the guide payload; a muted event type enqueued nothing; accept, new request and blocked dates reached the right recipients; ops status reported the backlog; disabling stopped new rows.
- Production: outbox reported `enabled=false, pending=0, provider=none`; a real traveller request succeeded (201) and still enqueued zero rows; the verification request and its inbox events were removed afterwards. Ledger 264, flag false, outbox 0, pending requests 0.

## Limits

E1 only queues. There is no provider adapter, sender cron, template, retry or retention yet, so enabling the flag would accumulate pending rows and send nothing. The email preference reuses the in-app mute until the owner chooses a separate channel preference.
