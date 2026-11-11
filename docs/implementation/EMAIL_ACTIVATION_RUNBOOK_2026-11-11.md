# Email activation runbook (Resend) — 2026-11-11

The pipeline is built and verified; this is the operator checklist that turns on live email. Steps 1–4 are owner/DNS actions; steps 5–9 are release actions. Nothing sends until step 8.

## 0. What exists already

- Outbox queue, sender cron every 15 min, bilingual templates, retry/backoff (1m/5m/15m/1h/6h then failed), 30-day retention, ops self-test, health check, `email-delivery-failing` alert.
- Production is **flag off / provider none / queue empty**; no email has ever been sent.
- Resend adapter: `POST https://api.resend.com/emails` with `Idempotency-Key`, 10s timeout, errors reduced to `resend <status>: <detail>`; verified locally against a stand-in API (4/4) and by 4 adapter unit tests.

## 1. Resend account and domain

1. Create a Resend account and add domain **`mail.kinnso.com`** (a subdomain keeps the root domain's reputation separate).
2. Resend shows DNS records to add at your DNS host:
   - **DKIM** TXT record(s) on the selector Resend provides.
   - **SPF**: TXT `v=spf1 include:...` on the sending subdomain (follow Resend's exact values).
   - **DMARC**: TXT `_dmarc.mail.kinnso.com` → `v=DMARC1; p=none; rua=mailto:<your inbox>` for observation first.
3. Wait for Resend to report the domain **Verified**.

## 2. API key

Create a Resend API key with sending permission only; keep it out of the repo and out of chat.

## 3. Vercel environment variables (Production and Preview)

| Variable | Value | Notes |
|---|---|---|
| `KINNSO_EMAIL_PROVIDER` | `resend` | selects the adapter |
| `KINNSO_EMAIL_API_KEY` | the Resend key | secret; no trailing spaces |
| `KINNSO_EMAIL_FROM` | `Kinnso <bookings@mail.kinnso.com>` | must be on the verified domain |
| `KINNSO_SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret | the sender resolves addresses through Auth admin; never exposed to the browser |

`KINNSO_SITE_URL` and `CRON_SECRET` are already configured (the launch gate depends on them).

## 4. Redeploy

Environment changes only apply to a new deployment: run the normal release deploy and promote, then check `/api/health`.

## 5. Verify the provider before enabling delivery

1. Sign in as the release operator.
2. `POST /api/ops/email/test` → expect `{"delivered":true,"provider":"resend",...}` and a real message in the operator's mailbox. The endpoint only ever sends to the signed-in operator's own address and never returns it.
3. If it reports `service-role-missing` or `provider-not-configured`, fix the env and redeploy; the queue flag is still off, so no user email is affected.

## 6. Enable delivery

1. `PUT /api/ops/email/outbox` with `{"enabled":true}`.
2. `/api/ops/health` → the `email-outbox` check should read `ok` (pending 0) or degrade if rows stall.
3. Create one real booking request from a test traveller; within 15 minutes the creator should receive the request email. Check the outbox row goes `pending → sent` with a `resend:` id.

## 7. Watch

- `/api/ops/email/outbox` pending/failed counts.
- `email-delivery-failing` alert fires once per hour while failed > 0 or the oldest pending row is over an hour.
- Failed rows retry five times with backoff; after that they stay `failed` for review (never silently dropped).

## 8. Rollback (30 seconds)

`PUT /api/ops/email/outbox {"enabled":false}` stops new sends immediately; queued rows stay queued until re-enabled. For a full stop, set `KINNSO_EMAIL_PROVIDER=none` and redeploy — the cron then reports `provider-not-configured` and no-ops.

## 9. Known limits for v1

- Email mute reuses the in-app mute (decision E4 deferred).
- No bounce/complaint webhook handling yet: a hard bounce keeps retrying and ends `failed`; the first cohort is small enough for manual review.
- Reminders remain read-time only; no email reminders.
- The first live message must be the ops self-test, not a user booking.

## Verification references

- Adapter unit tests: `apps/journeys/tests/email-provider.test.mjs` (4 tests).
- Local end-to-end with a stand-in API: `.local-private/email-resend-20261111/evidence.json` (4/4).
- Sender acceptance (console): `docs/implementation/EMAIL_SENDER_E2A_2026-11-10.md`.
- Ops tooling: `docs/implementation/EMAIL_OPS_E3_2026-11-10.md`.
