# Scheduler launch digest + simulated failure drill

**Status:** deployed and verified in production. Ledger 247 → 248, release `6be6acd`, production `dpl_5fYHH4VKq7WyKEz1mRXNB3AecK3a`.

## 1. What this closes

Two Phase 4 wordings had no mechanism behind them yet:

| Requirement | Before | Now |
|---|---|---|
| "no stale waivers" | expiry blocks the gate, but nobody is told a waiver is about to expire | daily 08:00 UTC digest alerts when a waiver is expired or expires within 14 days |
| "a deliberately failed check reaches the owner's destination" | the self-test proved transport of a plain test, not the failure path | `?test=1&state=<state>` sends a **labelled simulated-failure drill** through the real incident classification and delivery path |

## 2. Delivered

- **Migration `20261109190000_launch_digest.sql`** — `kinnso_public_launch_digest()`: aggregate counts only (accepted/pending/rejected sign-offs, waivers active/expiring/expired). Anon-executable so the scheduler needs no service key; no identities, notes or content. Post-check asserts the ops launch-state RPC is still not anon-executable.
- **Cron `health-alert`** — fetches the digest additively (a digest failure never turns a healthy snapshot into an alert), adds the `waivers-expiring` daily reminder at 08:00 UTC, and includes the digest in scheduled responses for diagnostics.
- **Simulated failure drill** — `GET /api/cron/health-alert?test=1&state=unavailable|cost-exhausted|content-not-ready|waivers-expiring` (scheduler credential) sends `{state, simulated:true, text}` through the same delivery path. Unknown states fall back to the plain self-test, so a typo cannot fake an incident.

## 3. Verification

**Local 7/7:** digest readable with the publishable key and counts-only keys · scheduled run returns the digest · drill delivered and labelled · unknown simulated state falls back to the plain test.

**Production:**
- `/api/health` 200 and `/zh-HK/spaces` 200 on the promoted deployment
- drill without credential → **401**; with credential → **200 `{test:true, delivered:true, status:200}`** (a real POST to the configured destination)
- scheduled run returns the production digest: `signoffsAccepted 0, signoffsPending 6, waivers 0` — the honest current state

## 4. What this means for L3/L4 closure

- L3's "deliberately failed check reaches the destination" is now demonstrated end-to-end in production (labelled drill). The remaining L3 gap is only that the destination is the project-owned inbox; the owner can swap `KINNSO_ALERT_WEBHOOK_URL` and re-run the drill or send the one-click test.
- L4's matrix is deployed; the owner still records the 24 real device/AT results (or a dated waiver).
- Product PITR/backup remains the owner's decision; the logical restore rehearsal is recorded separately.

## 5. Limits

- The digest is aggregate-only; it cannot tell the owner *which* gate's waiver expires — the launch panel does that.
- The drill is clearly labelled and never counts as an incident; it proves transport and classification, not that a real outage would be triaged correctly.
- No escalation, retry queue or acknowledgement exists; delivery failure marks the scheduled run failed (503).
