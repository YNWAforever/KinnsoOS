# Travel collaboration usability continuation

> **For agentic workers:** Use superpowers:executing-plans. Execute inline, then request one fresh whole-branch review.

**Goal:** Help travellers progress from inspiration, help creators finish a publishable route, and prevent support replies or decisions being sent to the wrong case.

**Architecture:** Extend the existing Journey workspaces and their actor-bound recovery. Keep the current server contracts, SQL authorization, request receipts and publication authority. No new services or dependencies.

**Spec:** The user-requested continuation of `2026-10-11-creator-merchant-operations.md`, particularly P07, P12, P13 and P17; the acceptance criteria below bind this increment.

## Baseline and constraints

- Baseline main/observed production: `c5c73721c424f61121ce063c96fc9777e72b698c`.
- Baseline Journeys suite: 544 passed, 0 failed. Exact-main Journeys run 38144966477: verify, connected, auth-mailbox and operations-performance succeeded.
- Open PR #74 owns merchant initial recovery/source packing; #76 owns merchant lazy loading. Do not duplicate those changes.
- Preserve EN/zh-HK, actor invalidation, private fields, CAS, unknown-command receipts and immutable published versions.
- No hosted writes, capability activation, payments, booking claims, synthetic published travel content or changes to existing migrations.
- Anonymous production API probes: creator missions, merchant campaigns and inbox returned 503/UNAVAILABLE; session returned 200/null. This proves unavailability to these requests, not its root cause or authenticated behavior.
- Three consented real guides, designated staging/role UAT and human device/AT checks remain release gates. Code completion cannot satisfy them.

## Review focus

1. An acknowledged support command must preserve unrelated drafts, including after device restore and an unknown outcome.
2. Legacy unscoped reply text must never be silently assigned to a different case.
3. Account replacement while persistence or network work is outstanding must not restore prior private content.
4. A readiness checklist describes visible completeness; the server still decides publication, and unknown publish retries retain the original request.
5. Summary guides must never imply that authored stops exist or cause an automatic trip/adoption write.

### Task 1: Isolate support composition by case (P12, P17)

**Files:** `apps/journeys/app/travel/InboxWorkspace.tsx`, `apps/journeys/lib/collaboration/support-drafts.ts`, `apps/journeys/tests/support-draft-isolation.test.mjs`, existing support/recovery tests.

**Interfaces:** New case retains its own subject/message. `caseDrafts[caseId]` owns message, internal reason and decision; recovery keeps this versioned draft shape and the unchanged pending command. Successful commands clear only their own composition.

- [ ] RED: type in case A, case B and new-case form; assert independent values and actual submitted payloads. Repeat for ops decisions.
- [ ] RED: confirm A through receipt; B survives both UI and device recovery. Reject legacy unscoped text as a case default; preserve it visibly for manual copying.
- [ ] Implement bounded recovery parsing, per-case labeled forms, selective completion and actor invalidation.
- [ ] Verify `node --test tests/support-draft-isolation.test.mjs tests/collaboration-support.test.mjs tests/workspace-recovery.test.mjs`; expected all pass. Run full `npm test` before completion.
- [ ] Commit independently.

### Task 2: Guide publication completeness (P13)

**Files:** creator editor, `lib/creators/editor-operations.ts`, `tests/creator-editor.test.mjs` and a new readiness test.

**Interfaces:** `publicationReadiness(payload: DraftPayload)` returns issue codes/positions and authored day/stop counts. Input is an editing draft; blank day labels and descriptions remain optional. This is guidance, not a replacement for backend validation.

- [ ] RED: incomplete title/city/summary, zero days, empty days and blank stop names identify actionable missing fields; a fully authored draft passes without optional timings/descriptions.
- [ ] RED: actual editor shows missing fields and disables new publication until complete and saved; links target the corresponding fields. Save/retry behavior stays intact.
- [ ] Implement localized checklist, explicit save-first state and counts; use existing content only.
- [ ] Verify creator suites, full unit suite and TypeScript; expected all pass.
- [ ] Commit independently.

### Task 3: Traveller next step from summary guides (P07, P13)

**Files:** `GuideWorkspace.tsx`, relevant guide UI tests and native browser regression test.

**Interfaces:** Existing `/{locale}/trips` route. A summary keeps its accurate limitation and provides a named link to build a personal itinerary; no adoption or inferred stops.

- [ ] RED: both languages expose the manual-planning destination for a summary, with no apply action or trip write; structured guide behavior is unchanged.
- [ ] Implement the next-step copy and link in the summary state.
- [ ] Verify UI and existing traveller tests, build, exact-branch CI and one fresh review.
- [ ] Commit audit evidence and status matrix; create a reviewable PR. Record hosted gates separately from source completion.

## Decisions

- Ruling: user already requested audit and further development under the master plan. Complete these reversible fixes without another design-permission stop; merge/deployment remains a separate release decision.
- Ruling: use the fresh dedicated clone and feature branch as the isolated workspace; no shared checkout is changed.
- Ruling: supplementary skill scripts and `writing-good-tests.md` could not be read through their advertised resource paths. Use a local plan-specific ledger and the available TDD instructions; do not fabricate helper execution.
- Ruling: keep reminder payload enrichment for a separate migration-backed increment. Existing notification rows contain only the campaign title; fabricating milestone context in the client would mislead users.
