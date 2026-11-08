# Studio trip draft implementation plan

**Goal:** Carry a T1 brief into an explicitly saved, recoverable device itinerary.
**Architecture:** Pure input preparation, existing IndexedDB guest storage and
GuestPlanner, a focused UI handoff, and the original import/recovery path.
**Tech stack:** Next.js 16.3.8, React 19, TypeScript, Node tests, Playwright.
**Spec:** ../specs/2026-11-04-studio-trip-draft-design.md

## Constraints and review focus

- Preserve the previous uncommitted homepage phase and all original workflows.
- No guide/source attribution on manual drafts; preserve legacy guide validation.
- No storage writes until review and explicit device confirmation.
- Failed writes/readback retain the same identity; edits invalidate confirmation.
- Account changes/unmount cancel pending work; stale replies cannot restore text.
- Reuse the existing unsaved navigation, device deletion, and account import rules.

## Tasks

- [x] Add failing tests in `tests/studio-manual-trip.test.mjs` and
  `tests/e2e/studio-trip-draft.spec.ts` for own itinerary construction, input
  rejection, recovery/import, explicit save, retry, reload, edit, and delete.
- [x] Add `lib/studio/manual-trip.ts`: `prepareManualTripDraft(input, identity)`
  validates and builds a single-day `GuestTrip`. Extend `lib/trips/guest-drafts.ts`
  with explicit manual-origin records, validated dates and abortable saves.
- [x] Add `app/workroom/TripDraftHandoff.tsx` for input, review, confirmation,
  readback and reuse of GuestPlanner. Wire only T1's manual TaskStarter path;
  update the existing editor's optional source/date presentation.
- [x] Run focused and full Journeys tests, real browser flows, source tests,
  TypeScript, changed-file lint and build. Update source manifests/archives,
  request an independent review and record evidence/remaining boundaries.

Previous phase baseline: 1,594 Node tests and 25 browser cases passed. Its changes
remain uncommitted. This phase will be checked on top of them, without reverting
or committing the existing work.

Final results: `docs/implementation/STUDIO_TRIP_DRAFT_2026-11-04.md`.
