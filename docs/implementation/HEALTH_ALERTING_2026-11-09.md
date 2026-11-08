# S5b — Scheduled health alerting (slice report)

**Status:** implemented and verified locally (8/8, including a real simulated outage); shipping with a scheduler entry and an aggregate-only health RPC. External delivery is **ready to bind** — it needs two owner-set environment variables, no further code.

Date: 2026-11-09 · Parent: `4587255` (S5 live, ledger 242).

## 1. Why this slice

S5 made the deployment self-reporting on the ops page, but nothing reached a human when it broke. Alert binding was flagged as the largest operational gap. This slice closes the code half of that gap: a scheduled check that actually delivers to a webhook, with honest behaviour when the webhook is not configured.

## 2. Delivered

**Migration `20261109140000_health_alerting.sql`**
`public.kinnso_public_health()` — aggregate-only snapshot (published / synthetic / attested / verified guides, chat turns used this hour). No identities, no content, no per-account data; readable by anon like the public catalogue signal, and derived from the same rules as the ops page so the two cannot disagree.

**`GET /api/cron/health-alert`** (scheduler credential only, `CRON_SECRET` via Vercel cron's bearer header):
| State | When | Delivery |
|---|---|---|
| `ok` | snapshot readable, budget fine | nothing |
| `unavailable` | snapshot cannot be read at all | **every run** — a monitor must not go silent during an outage |
| `cost-exhausted` | hourly chat budget spent | on the :00 run, once per hour |
| `content-not-ready` | launch content gate still blocked | one daily digest at 08:00 UTC |

Delivery is a JSON POST to `KINNSO_ALERT_WEBHOOK_URL` (Slack-compatible `text` plus structured state/snapshot). Without a webhook the route still runs and returns `delivered:false` with the reason, so a missing binding is visible rather than silently "successful". Without `CRON_SECRET` the route no-ops instead of producing rejected scheduler noise. A failed delivery returns 503 so the scheduler run is marked failed.

**`vercel.json`** now schedules `/api/cron/health-alert` every 15 minutes. No service-role key is needed (the snapshot is anonymous and aggregate-only).

## 3. Local verification (8/8 PASS)

- unauthenticated scheduler call → **401**
- healthy run → `state:ok`, `delivered:false`, `webhookConfigured:true`
- anonymous aggregate RPC reachable over REST → **200**
- **simulated database outage** (Kong stopped, the only path to PostgREST): run reported `state:unavailable` and **delivered** the alert to the local webhook receiver; the captured payload contained the outage text
- a still-broken monitor kept alerting (no silent-failure mode)
- recovery → no alert, `state:ok`
- captured payloads in `webhook-deliveries.json`

A local quirk found while testing: Next normalises the request URL host to `localhost`, so a local `KINNSO_SITE_URL` of `127.0.0.1` makes the existing origin guard reject the scheduler call (403). Local runs must use `http://localhost:3495`; production uses the real site origin.

## 4. What the owner must do to actually receive alerts

1. Set `CRON_SECRET` in Vercel production (32–1024 characters, no surrounding whitespace). Vercel sends it automatically to cron invocations.
2. Set `KINNSO_ALERT_WEBHOOK_URL` to an approved destination (Slack incoming webhook or any endpoint accepting `{text}` JSON).
3. Redeploy so the new environment variables are live.

Until then the scheduled route returns `{skipped:'cron-secret-not-configured'}` and the ops panel continues to state that external alert delivery is not bound.

## 5. Limits

- The alert channel is one-way and has no retry/queue; a failed delivery only marks the scheduled run failed.
- `content-not-ready` is intentionally a daily digest, not an alarm: the launch gate is a known HOLD, not an incident.
- No alert history, acknowledgements or escalation policy.
- Backup/restore remains un-reinstated.
