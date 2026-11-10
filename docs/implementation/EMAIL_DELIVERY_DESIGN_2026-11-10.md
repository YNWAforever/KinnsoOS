# Email delivery readiness — design (no external account required)

**Status:** design only. Nothing in this document is deployed; email delivery stays off until the owner picks a provider and sending domain. This is the plan that makes that choice a configuration change rather than a build.

## 1. What email must do

The product already creates in-app notifications for booking events. Email is the same events delivered outside the app:

| Event | Recipient | Trigger (existing) |
|---|---|---|
| `booking.requested` | creator | request submitted |
| `booking.withdrawn` | creator | traveller withdraws |
| `booking.accepted` / `booking.declined` | traveller | creator decides |
| `booking.dates_blocked` | traveller with a pending request | creator blocks overlapping dates |

Bounded scope for the first release: **booking events only, one email per event, no marketing, no digest**. A weekly digest is a later option, not part of E1–E3.

Non-goals: storing traveller email addresses in booking rows, open/click tracking, marketing consent flows, inbound email.

## 2. Architecture

```
event inserted (existing RPCs)
        │  same transaction
        ▼
public.email_outbox (new, service-role only)
        │  cron every minute: /api/cron/email-outbox
        ▼
provider adapter (env-selected)  ──►  provider HTTP API
        │
        └─ status/attempts/next_attempt_at updated per attempt
```

- The existing notifiers write the inbox event; in the same statement they insert an outbox row **only when email is enabled and the recipient has not muted that channel**. No outbox row means no email; nothing retries from the inbox.
- The cron route is cron-credential-gated exactly like `health-alert`, has no user session, and uses only service-role reads to resolve the recipient address from `auth.users` at send time.
- Default off: `KINNSO_EMAIL_ENABLED` unset or `false` means the notifier RPCs behave exactly as today.

### 2.1 Schema (migration E1)

```sql
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null,          -- auth users id; never an address
  event_type text not null check (event_type in
    ('booking.requested','booking.withdrawn','booking.accepted','booking.declined','booking.dates_blocked')),
  entity_type text not null default 'booking_request',
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb, -- guide title, dates, party size; no contact details
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- RLS on; no grants to anon/authenticated; service role only (same pattern as `kinnso_internal` tables).
- Unique index on `(recipient_user_id, event_type, entity_id)` makes notification insertion idempotent across retries.
- Retention: sent rows deleted after 30 days by the existing retention cron family.

### 2.2 Provider adapter (E2)

```ts
type EmailMessage = { to: string; subject: string; text: string; html?: string; idempotencyKey: string };
type EmailAdapter = { name: string; configured: boolean; send(message: EmailMessage): Promise<{ id: string }> };
```

- `KINNSO_EMAIL_PROVIDER=none|resend|postmark|ses|console` (default `none`).
- `KINNSO_EMAIL_FROM`, `KINNSO_EMAIL_REPLY_TO`, `KINNSO_EMAIL_API_KEY` (name varies per provider).
- `console` adapter writes to the outbox log and marks sent — used by the local acceptance without any account or network.
- Any provider failure is recorded as `failed` with `next_attempt_at` backoff (1m, 5m, 15m, 1h, 6h; then stop and stay failed). Attempts capped at 5.

### 2.3 Templates (E2)

- Bilingual (zh-HK first, EN second) plain-text with a minimal HTML alternative; subject line states the event, not marketing copy.
- Content limited to: guide title, date range, party size, one line of status, link to the in-app page (`/inbox` or `/requests`). No traveller-created message text is copied into email by default (the traveller's own words could contain contact details the product does not otherwise store); the email says "open your inbox to read the message".
- One-click mute/unsubscribe: signed token link to `/settings/notifications` (adds an `email_mutes` table or a `channel` column to `notification_mutes`; decision needed — see §5).

### 2.4 Ops and safety (E3)

- Ops self-test: `GET /api/ops/email/test` (ops-gated) enqueues one email to the signed-in operator's own address only, and reports provider status without revealing the address.
- Health check: `email-outbox` check reports pending/failed counts and the age of the oldest pending row; degrades when failed > 0 or pending older than 15 minutes.
- Alerting: the existing health-alert cron treats `email-outbox` degraded like other states (new state `email-delivery-failing`).
- Logs contain the outbox id and status only; never addresses or bodies.
- Kill switch: setting `KINNSO_EMAIL_ENABLED=false` stops new rows and the cron no-ops; queued rows stay pending until re-enabled.

## 3. Rollout plan

| Slice | Content | Depends on |
|---|---|---|
| E1 | Outbox table + notifier inserts behind flag + retention (migration only, flag off) | provider decision not needed |
| E2 | Provider adapter (`console` + one real provider) + templates + cron sender | provider + from-domain |
| E3 | Ops self-test, health check, alert state, docs | E1/E2 |
| E4 | Digests (only if wanted) | separate decision |

E1 can start immediately and ships invisibly. E2 needs the provider and a verified sending domain (SPF/DKIM). E3 completes the operational story.

## 4. What the owner must decide before E2 starts

1. **Provider**: Resend / Postmark / Amazon SES / Cloudflare Email Service (any is a small adapter; pick on pricing, deliverability and region).
2. **Sending domain**: a subdomain such as `mail.kinnso.com` with SPF, DKIM and DMARC; who controls DNS.
3. **From name and reply-to**: e.g. `Kinnso <bookings@mail.kinnso.com>` with reply-to monitored or none.
4. **Email mute semantics**: (a) reuse the in-app mute table so one toggle silences both channels, or (b) separate email preference. Recommendation: separate column/table, because a traveller may want in-app but no email.
5. **First address to test**: an owner-controlled mailbox for the first live send; production test recipients must be owner-approved.

## 5. Risks and mitigations

- **Deliverability**: start with one low-volume transactional stream on a dedicated subdomain; monitor bounces via provider webhooks (E3+).
- **PII**: outbox stores user id and event metadata only; the address is resolved at send time and never persisted.
- **Spam/abuse**: email is only sent for events the product already creates; rate is bounded by booking activity.
- **Rollback**: flag off, cron no-op; queued rows can be deleted without user impact.

## 6. Open questions for the next conversation

- Is email required for launch, or is in-app-only acceptable for the first cohort?
- If required, does the owner prefer a provider already in use elsewhere, or the lowest-friction option (Resend)?
- Should the first live release include the blocked-dates email, or only request/decision emails?
