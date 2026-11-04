# Saved Stop Timing Implementation Plan

> Use superpowers:executing-plans for inline execution and one fresh final review.

**Goal:** Set, clear, save and reopen optional times for saved manual stops.

**Architecture:** Keep optional raw `scheduleInput` on transient keyed edit stops.
Reuse existing time parser/formatter; validate duration as digits, 1–1440.
Canonical snapshots strip UI input. GuestPlanner validates before Save and uses
stable stop keys plus account generations for editing.

**Tech Stack:** Existing Next.js 16, React, TypeScript, Node tests and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-stop-timing-design.md`

## Global constraints

Optional HH:mm 00:00–23:59; optional integer duration 1–1440 minutes. Explicit
verified device saving; no schema/dependency/provider/remote changes. Preserve
the current dirty branch, retain evidence, and leave changes uncommitted.

## Tasks

- [x] Model: add failing tests in `tests/device-trip-editor.test.mjs` for timing
  boundaries, invalid input, clearing, move retention, stale keys and guide
  rejection. Extend `lib/trips/device-trip-editor.ts` with `stopScheduleInput`,
  `stopScheduleIssue`, `changeManualStopSchedule(edit, stopKey, field, value)`
  and `manualTripStopScheduleIssue`. Strip `scheduleInput` in snapshots. Run
  `node --experimental-strip-types --test tests/device-trip-editor.test.mjs`:
  observe missing behavior, then all cases pass.
- [x] UI: add failing component tests in `tests/guest-planner.test.mjs` for
  optional timing, invalid Save/save-and-leave, retry, clearing and stale/busy
  handlers. Add bilingual text inputs/errors to `app/travel/GuestPlanner.tsx`,
  binding to the model above and guarding handlers by generation/actor/lock.
  Run both focused test files: failures before implementation, all pass after.
- [x] Runtime: add English/Chinese real browser cases to
  `tests/e2e/studio-trip-draft.spec.ts`, covering invalid input with unchanged
  IndexedDB, moving/reopening scheduled stops, clearing, and narrow screens.
  Run full `npm test`, `playwright.home.config.ts`, typecheck, scoped lint,
  source-package checks and production build with backend capabilities disabled.
  Expected: no failures; only existing effect lint warnings.
- [x] Review and delivery: fresh scoped review, resolve material findings,
  update README/implementation record, refresh local source/Windows packages,
  verify archive bytes and source fingerprints, run `git diff --check`.

## Review focus

- Invalid raw text must not silently clear or coerce a saved time.
- Moves must keep the same stop's input; stale handlers must not edit another.
- Blank, midnight and 1440-minute durations must stay distinct.
- Validation must precede write/readback and navigation acknowledgment.
- Invalid unsaved input must not break removal, deletion or account recovery.

Evidence and progress: `.local-private/stop-timing-phase-20261104`.
