# Multiple-day Trip Drafts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan
> in the current workspace, preserving the existing uncommitted continuation.

**Goal:** Prepare, review, explicitly save and reopen a trip containing multiple
days from the existing T1 homepage flow.

**Architecture:** Extend the pure manual-draft builder to consume day arrays.
Keep stable day keys only in the React form; persist the existing GuestTrip shape.
Reuse the existing device store, cancellation, editor and import preview.

**Tech Stack:** Next.js 16.3.8, React 19.2.4, TypeScript, Node test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-multiday-trip-drafts-design.md`

## Global constraints

- 1–30 days; 1–20 stops per day; at most 200 stops total.
- Titles at most 200 characters; optional note at most 4,000 characters.
- No dependency upgrades, data migrations, backend activation or deployment.
- Preserve prior dirty work. Record this phase against file snapshots rather
  than staging or committing unrelated prior changes.

## Review focus

- Reordering must keep user text with the same day and invalidate prior consent.
- Removing a filled day requires confirmation; cancelling keeps all its input.
- A later empty/invalid day must block review without persisting any trip rows.
- Thirty valid days and exactly two hundred stops must remain recoverable.
- A day removed/reordered must not duplicate or drop the trip note.

## Task 1: Structured preparation

Files: `apps/journeys/lib/studio/manual-trip.ts`,
`apps/journeys/tests/studio-manual-trip.test.mjs`.

- [x] Change input fixtures to `days: {title: string; stops: string[]}[]`; add
  order, note placement, 30/31-day and 200/201-stop boundary cases.
- [x] Observe failures against the single-day implementation.
- [x] Update `ManualTripInput` and `prepareManualTripDraft` to validate every day
  before returning the existing GuestTrip shape, using consecutive offsets.
- [x] Verify focused preparation, recovery and import tests.

## Task 2: Day editor and complete journey

Files: `apps/journeys/app/workroom/TripDraftHandoff.tsx`,
`apps/journeys/app/workroom/workroom.css`,
`apps/journeys/tests/e2e/studio-trip-draft.spec.ts`.

- [x] Add failing real-browser cases for adding/reordering/removing days,
  removal cancellation, invalidated consent, invalid later days and bilingual use.
- [x] Implement stable day state and labelled fieldsets, explicit row-action
  buttons, confirmed removal and complete per-day preview.
- [x] Verify multi-day save and exact IndexedDB state, reload/reopen and editing;
  extend existing viewport checks to include multiple days.
- [x] Run all Journeys Node tests, the homepage/trip browser suite, TypeScript,
  changed-file lint, source-package tests and the disabled-backend build.
- [x] Obtain one fresh scoped review, address material findings and rerun checks
  justified by any fixes. Record final evidence and source fingerprints.

## Progress

Baseline: HEAD `807714e`; prior continuation remains uncommitted. Phase snapshots
and raw logs: `.local-private/multiday-trip-phase-20261104`.

Task 1 complete: focused preparation/recovery/import tests 31/31; full Journeys
suite 1,619/1,619 after review fixes. The public builder input now uses day arrays;
stored records retain the original GuestTrip shape.

Task 2 behavior verified: 32/32 real-browser cases. Fresh scoped review found one
material issue, long-title overflow; regression reproduced it and the final
suite verifies wrapping in preview and reopened device editor. The test selector
correction preserves the original privacy and cleared-input assertions. No
deferred review findings or product-scope rulings remain.

Final build passes with backend capabilities disabled. All corresponding-source
hashes were read back successfully; the eight modified application/test/README
files match the archive. Local Windows packaging also passes readback. This does
not change the paused external file-delivery boundary.
