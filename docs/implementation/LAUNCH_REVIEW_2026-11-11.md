# Launch review — KinnsoOS production, 2026-11-11

**Verdict: `launch-ready` for the free, in-app booking product.** Live at <https://kinnso-os.vercel.app>; no blockers in the launch control plane; all seven gates accepted; CI green on the released commits.

This review is evidence-based: every claim below maps to a production check or a receipt in `docs/implementation/`. It deliberately separates **what is ready**, **what is waived**, and **what is still absent**.

## 1. Production state (captured 2026-11-11T01:55Z)

| Fact | Value | Evidence |
|---|---|---|
| Deployment | `dpl_Hwo3SchetNv5wUa6RTB9fhKeKAG7`, production, health `{"ok":true,"db":"up"}` | `/api/health`, `/api/ops/health` |
| Database ledger | **268** (`20261110170000`) | `supabase_migrations.schema_migrations` |
| Launch control plane | `verdict: launch-ready`, `blockers: []` | `/api/ops/launch` |
| Content | 8 published, 8 verified, 0 unverified, 0 synthetic; 3 drafts | launch gate + psql |
| Ops health | all checks `ok`: database, content-gate, cost-guard (0/30 turns), model, booking-queue, email-outbox (disabled), deployment | `/api/ops/health` |
| Booking queue | 0 pending, 0 stale, 2 accepted (7d) | launch digest |
| Email | flag off, queue 0, failed 0, provider `none` | public snapshot |
| Release CI | Journeys run on `a024c6c` success; Verify (cutover gate) success | GitHub Actions |

## 2. Gates

| Gate | Status | Expires | What it means |
|---|---|---|---|
| content | accepted (automatic) | — | 8 verified guides, none synthetic/unverified |
| alerting | accepted (automatic) | — | webhook + scheduler secret configured |
| rollback | accepted (signoff) | — | rollback drill executed and re-verified |
| accessibility | accepted (signoff) | — | axe 0 violations + keyboard/reflow on new surfaces |
| backup | accepted (waiver) | **2026-12-09** | restore rehearsals matched; platform PITR unverified |
| privacy | accepted (waiver) | **2026-12-09** | AI disclosure/export/deletion live; legal review pending |
| devices | accepted (waiver) | **2026-12-09** | 0/24 physical/AT matrix recorded; automated a11y only |
| payments | accepted (waiver) | **2026-12-09** | paid surfaces out of scope; no payment code deployed |

The four waivers expire on **9 December 2026**; when they lapse the launch gate returns to blocked unless they are renewed or satisfied. That is the hard deadline for this phase.

## 3. What shipped in this phase

| Slice | Ledger | Release | Verification |
|---|---|---|---|
| Cursor (keyset) pagination | 263 | `dc89d53` | local 4/4 + prod read-only |
| Email E1 queue (flag off) | 264 | `46e17f4` | local 7/7 + prod inert |
| Email E2a sender + templates + retry | 265 | `7d67228` | 4 unit + local 7/7, 3/3 retry, 2/2 recovery |
| Email E3 ops self-test, health, alerting, retention | 266 | `8d8c023` | 5 unit + local 7/7 + prod inert |
| Booking completion (B1) | 267 | `3daa735` | local 7/7 + prod read-only |
| Upcoming trips (B2) | 268 | `d5b784d` | local 4/4 + prod read-only |

Every slice has a receipt under `docs/implementation/*_ROLLOUT_2026-11-10.json` and an acceptance suite in `.local-private`.

## 4. What is genuinely not done

These are **known absences**, not regressions:

1. **No real email has ever been sent.** The queue, sender, retry and ops tooling are built and verified with console adapters; production is flag-off with no provider. Needs 3 owner inputs (see decision brief).
2. **No physical-device or assistive-tech testing** (matrix 0/24). Waived until 2026-12-09; automated a11y passed.
3. **Platform PITR/backup choice unverified.** Logical restore rehearsals passed; the owner must choose the backup/PITR posture.
4. **No payments.** Deliberately out of scope; paid surfaces are Phase 6 and blocked on five decisions.
5. **Reminders are read-time only.** Upcoming trips appear when the page is opened; no push/email reminder.
6. **Owner data cleanup pending:** 2 old accepted booking rows and 3 automation identities remain in production.

## 5. Recommendation

**Proceed with a soft launch of the free product now**, within the waiver window, and use the next four weeks to clear the owner decisions and the device matrix. Do not start payments before those decisions; the schema and money flow would otherwise be rework.

Suggested launch sequence:

1. Owner performs the 10-minute cleanup (2 rows, 3 identities) so production reflects real users only.
2. Soft launch to the first creator cohort; watch ops health + booking queue daily.
3. Clear the email decision and ship E2b (live provider) — the only missing user-facing channel.
4. Record physical-device cells incrementally; renew or satisfy waivers before **2026-12-09**.
5. Only then open Phase 6 decisions.

## 6. Evidence index

- Launch control: `/api/ops/launch` (captured in `.local-private/launch-review-20261111/prod-evidence.json`)
- Ops health: `/api/ops/health` check list in the same capture
- Devices: `/api/ops/devices` (0/24 pending, 0 failed)
- Public aggregates: `kinnso_public_health()` and `kinnso_public_launch_digest()`
- Per-slice receipts: `docs/implementation/` (`CURSOR_PAGINATION`, `EMAIL_OUTBOX_E1`, `EMAIL_SENDER_E2A`, `EMAIL_OPS_E3`, `BOOKING_COMPLETION`, `UPCOMING_BOOKINGS`)
- Rollback: `ROLLBACK_REHEARSAL.json`; accessibility: `ACCESSIBILITY_PASS_2026-11-09.md`

_Review produced from production data on 2026-11-11; no production mutation was performed for it._
