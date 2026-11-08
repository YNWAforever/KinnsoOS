# L1 — Launch decision control plane (slice report)

**Status:** implemented and verified locally (13/13); committed and CI/deploy pending. No content, no user-visible surface outside ops.

Date: 2026-11-09 · Parent: `73035b6` (health alerting live, ledger 243).

## 1. Why

The launch gate has lived in documents, chat and release receipts. Every prior slice produced evidence, but no product surface turned that evidence into a decision. This slice makes the decision data: automatic gates computed from live facts plus append-only owner sign-offs with evidence notes, and a verdict that cannot be inferred from silence.

## 2. Delivered

**Migration `20261109150000_launch_gates.sql`**
- `kinnso_internal.launch_signoffs` — append-only records (gate, status accepted/waived/rejected, note 20–2000 chars, actor, time); RLS on; no client grants.
- `kinnso_ops_launch_state()` — ops-only; returns content facts (published/synthetic/unverified/verified and a derived readiness) plus the latest sign-off per gate.
- `kinnso_ops_sign_off(gate, status, note)` — ops-only; validates gate/status/note and appends; returns the new state.

**`GET/POST /api/ops/launch`** — ops-only; GET evaluates gates and verdict, POST records a sign-off (201); 400 invalid input, 401 anonymous, 403 non-ops, 503 backend.

Gates:

| Gate | Type | Satisfied by |
|---|---|---|
| content | automatic | verified > 0, unverified = 0, synthetic = 0 |
| alerting | automatic | `KINNSO_ALERT_WEBHOOK_URL` and `CRON_SECRET` configured |
| rollback | sign-off | rehearsal receipt |
| backup | sign-off | restore check or formal waiver |
| privacy | sign-off | disclosure + request channel decision |
| accessibility | sign-off | automated pass + limits recorded |
| devices | sign-off | physical device and screen-reader acceptance |
| payments | sign-off | out of scope for the free launch: must be accepted or waived explicitly |

Verdict is `launch-ready` only when every required gate except `payments` is accepted; any pending/rejected gate is a blocker. `payments` is displayed but not required, and cannot be silently assumed.

**`LaunchDecision` panel** at the top of `/ops/readiness` — verdict and blockers, every gate with status/detail/date, a decision form (gate, accepted/waived/rejected, evidence note), explicit validation and failure states, and the note that decisions are append-only.

## 3. Local verification (13/13)

- launch state exposes 8 gates; content gate computed live (`3 verified · 0 unverified · 0 synthetic · 3 published`); alerting gate accepted when configured; initial verdict `hold` with the five unsigned gates as blockers
- short note → 400; unknown gate → 400
- accepted sign-off → 201; append-only behaviour proven (a second decision replaces the displayed record, first record retained in the table)
- after signing rollback, backup, privacy, accessibility and devices → verdict `launch-ready`, blockers `[]`
- rejecting `devices` → verdict returns to `hold` with `devices` blocking; re-accepting clears it
- readiness page renders the panel with 8 rows and the correct verdict
- non-ops 403, anonymous 401

The local acceptance seeded verifiable content and then signed the human gates as test operator; these records exist only in the local database, not production.

## 4. What this changes for launch

Launch is now decidable in-product. The owner opens `/ops/readiness`, sees exactly which gates are automatic (content, alerting — both computable) and which need a decision, records each decision with evidence, and watches the verdict change. A rejection reopens the hold; nothing is inferred from absence.

## 5. Open items

- Production after this deploy will show `hold` with content blocked (9 published, 0 verified) and all human gates pending — the honest state.
- A one-click export of the launch packet (verdict + gates + evidence) is the natural follow-up; the API already returns the data.
- Device/AT gates can only be accepted by the owner; the product records the decision, it cannot verify the human act.
