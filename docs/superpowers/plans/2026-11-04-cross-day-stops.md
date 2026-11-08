# Cross-day Stop Moves Implementation Plan

**Goal:** Move a saved manual stop between days without losing its note/time,
changing date offsets or bypassing explicit verified saving.

**Architecture:** Extend `ManualTripStructureCommand` with `transferStop` and
atomic immutable source/destination updates. GuestPlanner owns generation-scoped
destination choices and a post-commit focus request, separate from saved data.

**Spec:** `docs/superpowers/specs/2026-11-04-cross-day-stops-design.md`

- [x] Add failing pure transfer tests; implement `transferStop` in
  `lib/trips/device-trip-editor.ts`.
- [x] Add failing component selection/move/account/busy tests; integrate explicit
  controls and focus restoration in `app/travel/GuestPlanner.tsx`.
- [x] Cover real bilingual moves/save/reload/focus and long destination titles
  at 320/390px in `tests/e2e/studio-trip-draft.spec.ts`.
- [x] Run full Node/browser regressions, TypeScript/lint, source tests and build.
- [x] Obtain fresh review, address material findings, document source hashes and
  local packaging readback. Keep existing work local and uncommitted.

Review focus: atomic moves; capacity at 200 total; date gaps; stale source/target
selections and account generations; focus without persisting UI state.

Evidence: `.local-private/cross-day-stop-phase-20261104`.
