# Kinnso Pilot Residual Race Follow-Up Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task.

**Goal:** Close the three residual findings from the whole-branch review without changing production or weakening the existing pilot security model.

**Spec:** `docs/superpowers/specs/2026-11-07-kinnso-pilot-control-room-design.md`

**Starting commit:** `1d26cb6c44d59a68212dd44f3d98f1e16c5f7b2c`

## Global Constraints

- Work in `C:\Users\laich\Documents\KinnsoOS\.worktrees\single-origin-design-20261105`.
- Keep production, the Journeys deployment and production capabilities unchanged.
- Keep backup/restore waived.
- Use only the ownership-verified isolated target `kinnsoos-public-it-20261106`.
- Keep all new records synthetic, unmistakably labeled and fully garbage-collected.
- Keep physical iOS, physical Android, VoiceOver and NVDA `BLOCKED/NOT_RUN`.
- Keep real notice artifacts, participants and content as external gates.
- Preserve existing authorization, audit, idempotency, replay, privacy and release boundaries.
- Add failing regressions before each product fix.
- No subagents inside implementer or reviewer agents.

## Task 1: Bind withdrawals and reconcile edits

**Files:**
- Modify the account withdrawal command contract, participant UI and pilot RPC implementation.
- Modify the creator-session edit API, client retry behavior, database support and tests.
- Modify the guide publication email-authorization boundary and regression tests.
- Add one forward migration if a database change is required.

**Steps:**

1. Add a RED two-session test where a user opens withdrawal confirmation for run A, joins run B in another session, then confirms the stale run A dialog. Require run B to remain unchanged and the stale command to return a non-retryable conflict.
2. Add the displayed run ID and participant ID to the withdrawal command. Validate actor ownership, run identity, participant identity, status and revision under the same lock; reject stale selection.
3. Add a RED lost-response creator-session edit test: edit A commits, edit B persists newer content, Retry A arrives, and the newer content must not be overwritten.
4. Add server-side request-idempotency and revision/reconciliation protection for creator-session edits. Exact replay returns the original result; changed payload or stale revision conflicts without overwriting.
5. Add a RED unconfirmed-email ordinary-publication test. An unconfirmed creator must still publish an ordinary guide, while an unconfirmed pilot participant must remain unable to claim or publish pilot content.
6. Restore confirmed-email enforcement to the pilot-only path; do not weaken pilot participant authorization.
7. Run focused tests, relevant isolated integration tests, TypeScript and source-package checks. Commit the fixes.

## Task 2: Full regression and release approval packet

**Files:**
- Modify `apps/journeys/scripts/source-manifest.json` if needed.
- Regenerate the exact source archive.
- Regenerate `docs/implementation/PILOT_CONTROL_ROOM_RELEASE_2026-11-07.md`.
- Regenerate `docs/implementation/PILOT_CONTROL_ROOM_RELEASE_2026-11-07.json`.

**Steps:**

1. Run the full Journeys unit suite with the required Windows test access, TypeScript, default `npm run build`, and source-package tests.
2. Reset and verify the full migration chain, ledger, advisors, direct privileges and integration tests on the isolated target.
3. Run one fresh attested connected Chromium matrix with no retries or server reuse, including the happy path, negative security path and representative existing creator, merchant, operations, support, recovery and accessibility suites.
4. Run the separate presentation matrix.
5. Verify exact cleanup and restore temporary isolated test configuration.
6. Regenerate the release packet with the final source/tree/build IDs, exact migration hashes, archive hashes, test counts, known warnings and every remaining external blocker.
7. Keep the verdict at `READY_FOR_USER_REVIEW` only if every requested gate passes; keep production `UNCHANGED`, deployment `UNVERIFIED`, real participation `BLOCKED`, and public launch `HOLD`.
8. Commit the packet and source-manifest updates.

