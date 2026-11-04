# Saved Trip Details Implementation Plan

**Goal:** Edit and verify saved manual-trip metadata without losing the saved
copy or enabling account import before confirmation.

**Architecture:** Extend the current manual-trip validation and GuestPlanner.
Reuse existing fields, storage identity, generation/revision guards and readback
comparison; keep guide-derived metadata outside the editable manual fields.

**Spec:** `docs/superpowers/specs/2026-11-04-saved-trip-details-design.md`

## Work

- [x] Add failing validation, metadata editing and deferred readback tests.
- [x] Implement manual metadata validation, controlled fields and verified saves.
- [x] Cover mismatch/failure retry, newer edits during readback, cancellation and
  unchanged guide provenance with focused tests.
- [x] Exercise bilingual edits, invalid-input preservation and reload/reopen in
  real Chromium; retain all existing homepage/trip regressions.
- [x] Run all Journeys Node tests, browser suite, TypeScript, changed-file lint,
  source-package checks and disabled-backend production build.
- [x] Obtain fresh scoped review, fix material findings, record final fingerprints
  and corresponding-source readback. Keep changes local and uncommitted.

## Review focus

- A write acknowledgement without a matching read cannot enable import.
- A newer metadata edit during readback cannot be marked saved by the older read.
- An invalid date/zone/title keeps the prior saved record and every stop/note.
- Guide-derived copies retain source/version and their existing nullable date.
- Account changes during readback cannot acknowledge another actor's editor.

## Results

Final: 1,635 Node tests, 36 browser cases plus two mobile rechecks, ten source
package tests, TypeScript and production build pass. Lint has zero errors and
three existing GuestPlanner effect warnings. Fresh review found no material
defect; its suggested manual-field/unmount readback coverage was added. All
source-archive hashes and local Windows packaging read back correctly. Changes
remain uncommitted, with no external upload or deployment. Evidence and phase
fingerprints: `.local-private/saved-trip-details-phase-20261104/verification.json`.
