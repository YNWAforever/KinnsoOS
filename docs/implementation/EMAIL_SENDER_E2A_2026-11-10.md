# Email delivery E2a — sender, templates, retry/backoff

**Status:** deployed and verified in production, inert (no provider, flag off). Release 7d67228, ledger **265** (`20261110140000`), deployment dpl_GzwCZCdHMT9CmXhyM3Myn2orBbJ3.

## What shipped

- Provider adapter seam (`none` / `console` / `console-fail`); a real provider is one more case once chosen.
- Bilingual booking templates for the five event types; they link back to the app and never copy the traveller's free text.
- `GET /api/cron/email-outbox` (scheduled every 15 minutes): cron-gated, claims each due row before sending, resolves the recipient address from Supabase Auth at send time, records the provider message id, and retries failures with 1m/5m/15m/1h/6h backoff before marking them failed.
- Public flag probe + explicit service-role grants for the sessionless sender.

## Verified

- 4/4 template unit tests (bilingual subject, correct links, no free text, blocked-dates range, safe unknown type).
- Local 7/7 with the console provider: no-auth cron 401, flag-off no-op, queue → sent with provider id, no resend, independent second send, ops status.
- Local 3/3 retry: a failing adapter keeps the row pending with attempts/backoff, is skipped before `next_attempt_at`, and increments to attempt 2. Local 2/2 recovery: the backed-off row sent once the provider worked, then state reset.
- Production: unauthenticated cron 401; ops status `enabled=false, pending=0, provider=none`; ledger 265, outbox 0, pending requests 0. Vercel accepted the second cron entry and the deployment is READY.

## Limits

No provider is configured, so no real email has ever been sent; only the console adapters exercised the pipeline. E2b needs the provider choice, verified sending domain, and a service-role credential in the Vercel environment. Sent-row retention arrives with E3.
