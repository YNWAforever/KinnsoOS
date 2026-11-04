# Saved Trip Structure Implementation Plan

**Goal:** Arrange days/stops after saving a manual device trip without losing
notes, identity, pending-edit protection or the previous saved copy.

**Architecture:** A small pure editor model adds transient day/stop keys, applies
manual-only commands, and converts through the existing codec before persistence.
GuestPlanner keeps ownership of dirty/revision/generation state and confirmation.

**Spec:** `docs/superpowers/specs/2026-11-04-saved-trip-structure-design.md`

## Tasks

- [x] Write failing pure tests in `tests/device-trip-editor.test.mjs` for editor
  initialization, snapshots, structural edits, notes/times, limits and guide guards.
- [x] Implement `lib/trips/device-trip-editor.ts`: `GuestTripEdit`,
  `beginGuestTripEdit`, `guestTripEditSnapshot`, `changeManualTripStructure`.
- [x] Add failing component tests, then integrate keys, manual controls and
  confirmed removal into `app/travel/GuestPlanner.tsx`. Preserve old guide tests.
- [x] Add actual bilingual structure/edit/save/reload tests to the existing
  homepage/trip browser suite; assert original storage until Save and stripped keys.
- [x] Register source files, run the full Node/browser suites, mobile checks,
  TypeScript/lint, source tests and disabled-backend build.
- [x] Obtain fresh scoped review, address material findings and record final
  hashes/readback. Retain local evidence and existing uncommitted work.

## Review focus

- Focus and note identity follow moved nodes; editor keys never enter storage.
- Removal cancellation/confirmation and account changes cannot delete a new target.
- Day edits renumber offsets; stop-only edits preserve existing date gaps.
- 30/50/200 boundaries and empty working days remain recoverable.
- Unknown saves, newer edits and legacy guide provenance retain their safeguards.

Evidence: `.local-private/saved-trip-structure-phase-20261104`.

Final: 1,648 Node tests; full 40-case browser suite plus one focused browser case
covering DOM identity/focus across all move directions; ten source-package tests;
TypeScript, lint and production build pass. Lint has zero errors and three
existing GuestPlanner warnings. New stale removal request/confirmation tests
reproduced account-switch bugs, now fixed with actor/generation guards. Fresh
review found no material defect; its focus-coverage suggestion was addressed.
All source hashes and local Windows packaging readback pass. No external writes.
