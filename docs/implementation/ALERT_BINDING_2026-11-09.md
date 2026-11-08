# L3 — Alert binding and recovery rehearsal (slice report)

**Status:** delivery path deployed and verified end-to-end in production; logical restore rehearsal passed with matching counts. The owner must still point alerts at their own destination and record the sign-off; platform PITR restore remains unexercised.

Date: 2026-11-09 · Parent: `d033470` (L2 live) · Production: `dpl_9k2hmX8F8UzzVVdChuUeAxMbQqjy` (release `1642ab1`), ledger 245.

## 1. What was built

| Piece | Purpose |
|---|---|
| `lib/ops/alerts.ts` | One delivery path shared by scheduler and operator test (webhook URL + optional inbox token header) |
| `GET /api/cron/health-alert?test=1` | Scheduler-credential-gated self-test: sends a labelled test alert through the real path |
| `POST /api/ops/alerts/inbox` | Project-owned destination authenticated with `KINNSO_ALERT_INBOX_TOKEN`; logs `ALERT_RECEIVED`, stores nothing |
| `POST /api/ops/alerts/test` | Ops-session self-test (never cron-secret-gated, so a leaked scheduler secret cannot send mail as the owner) |
| Health panel control | "Send test alert" with explicit delivered / not-configured / failed states |

## 2. Production configuration (done)

Set in Vercel production (values generated locally, never printed):
`CRON_SECRET`, `KINNSO_ALERT_WEBHOOK_URL = https://kinnso-os.vercel.app/api/ops/alerts/inbox`, `KINNSO_ALERT_INBOX_TOKEN`.

A first attempt over stdin stored values with a trailing newline (both inbox and cron returned 401). Re-added non-interactively with `--value`; verified below.

## 3. Production verification (passed)

- inbox without token → **401**; with token → **200 `{received:true}`**
- cron self-test without credential → **401**; with credential → **200 `{test:true, delivered:true, status:200}`** — a real POST from the deployed scheduler path to the configured destination
- anonymous ops self-test → **403**
- `/api/health` 200 and `/zh-HK/spaces` 200 on the promoted deployment

## 4. Restore rehearsal (logical, passed)

- `pg_dump --schema-only` of the product schemas from live production, restored into a clean local database: **exit 0**, **180 tables, 431 functions, 419 indexes, 126 triggers, 133 policies**.
- Key rows (`public.creators`, `public.guides`) restored and compared: production **13 creators / 11 guides / 9 published**, restored **13 / 11 / 9** — identical.
- Platform auth/extensions objects were stubbed in the empty target since they are platform-managed; this is a logical product restore rehearsal, **not** a platform PITR/snapshot restore.

## 5. What remains for L3 to be truly closed

1. Owner replaces `KINNSO_ALERT_WEBHOOK_URL` with their own destination (Slack/PagerDuty/email webhook), redeploys, and presses "Send test alert" once; or accepts the in-product inbox as the destination.
2. Platform backup/restore (PITR) is still unverified — the 7 Nov waiver remains in force and must be either reinstated (Supabase plan/tooling) or formally waived in the launch panel.
3. `rollback` and `backup` sign-offs in the launch panel remain pending; only an ops session can record them.

## 6. Honest limits

- The in-product inbox logs deliveries to the deployment log; it is a verification destination, not a paging system.
- Alert delivery is one-way without retry/queue; a failed delivery marks the scheduled run failed (503).
- The cron self-test sends a labelled test, not a simulated incident: it proves transport and destination, not that a real incident would be classified correctly (the logic is unit/acceptance tested separately).
