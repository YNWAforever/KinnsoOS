# S5 — Operational visibility and rollback rehearsal (slice report)

**Status:** ops health panel implemented and verified locally; shipping app-only (no migration). Rollback rehearsal executed after promotion and recorded below.

Date: 2026-11-09 · Parent: `2bc2626` (S4 live, ledger 242).

## 1. Why this slice

The readiness page counted content, but nothing told operations whether *this deployment* is actually working: whether the database and RPC grants answer, whether the turn cost guard is near exhaustion, whether the model is configured, and which commit/environment is serving. External alert binding still needs an approved alert destination, so this slice makes the deployment self-reporting first.

## 2. Delivered

**`GET /api/ops/health`** (ops role required, same-origin not needed for a read):
five live checks executed inside the deployment, each timed:
| Check | What it proves |
|---|---|
| `database` | the ops session + `kinnso_content_readiness()` RPC grant + database round-trip all work |
| `content-gate` | derived readiness counts; `degraded` until verified > 0 and synthetic = 0 |
| `cost-guard` | the chat turn budget for the current hour; `degraded` when exhausted |
| `model` | whether the model provider is configured (no external call is made) |
| `deployment` | commit, deployment URL and environment from Vercel's runtime variables |

The aggregate verdict is `fail` if any check fails, `degraded` if any is degraded, else `ok`.

**`OpsSystemHealth`** panel at the top of `/ops/readiness`: verdict, timestamp, per-check status/detail/latency, manual "Check now", bilingual copy, and an explicit note that external alert delivery is **not** bound yet. Loading/access-required/unavailable states are explicit; a failure is never rendered as healthy.

## 3. Local verification

| Check | Result |
|---|---|
| TypeScript | PASS |
| Production build | PASS |
| Ops API | PASS — 5 checks, verdict `ok`, per-check latencies (database 6 ms, content gate 4 ms, cost guard 5 ms) |
| Panel | PASS — renders on `/ops/readiness`, refresh re-runs checks, content-readiness panel unaffected |
| Role gate | PASS — non-ops **403**, anonymous **401** |

A real defect was caught here: the first implementation returned 200 to a signed-in non-ops user (each check failed internally but the envelope stayed 200). Fixed with an explicit `actor.roles.includes('ops')` gate before any check runs.

## 4. Rollback rehearsal

After promotion, the previous production deployment is temporarily re-promoted, health-checked, and the new deployment restored — proving the documented rollback target works and the additive database is compatible with the older build. Recorded in `ROLLBACK_REHEARSAL.json` with timestamps, deployment ids and the response of each step.

## 5. What remains for operational readiness

- **External alert binding is still NOT_VERIFIED.** The panel states this; binding needs an approved destination (email/webhook/PagerDuty) and credentials that are not available here.
- Alert thresholds (error rate, provider failure, budget exhaustion) are computed but not pushed anywhere.
- Backup/restore was waived on 7 November and has not been reinstated.
- On-call ownership and the launch-owner sign-off remain open.
