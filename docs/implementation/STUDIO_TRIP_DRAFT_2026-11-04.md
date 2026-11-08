# Studio brief to traveller draft

The previous T1 manual brief opened a blank trip workflow. This phase adds an
explicit handoff from that brief to a reviewed itinerary, actual device storage,
and the existing editor/recovery screen. It completes a bounded traveller story
within CS3/T10; it does not mark every CS3 requirement complete.

## Try the flow

Homepage → **Plan my trip** → **Review brief** → **Prepare a trip draft**.
Enter a title, optional date, time zone, and one to twenty stops. The brief starts
as an editable note on the first stop. Review the itinerary, confirm device
storage, and save. **View saved device trips** opens the existing trip workspace;
choose **Preview device-only drafts**, select the copy, then edit or delete it.

Dates and notes survive reopening. Stop order is exactly the entered order;
times stay unset, and manual copies carry no invented guide or author identity.
English and Traditional Chinese flows are covered.

## Behavior and reliability

- Preparing/reviewing/editing the form does not persist private text. Saving needs
  an explicit checkbox. Changing any field invalidates preview and consent.
- Success follows a completed IndexedDB save and matching readback. An unconfirmed
  readback retains the input and retries the same device identity without creating
  another copy.
- Saved manual copies use `origin: 'manual'`. Existing guide-copy recovery keeps
  its original source/version rules; mixed manual/source claims are rejected.
- The existing unsaved-draft guard handles navigation and Save and leave.
  Account changes/unmount cancel pending initial and edited-copy saves. The editor
  retains unsaved device fields for its existing explicit resume flow; stale replies
  cannot acknowledge old work or unlock a newer save.
- Device visibility and the separate account-import confirmation are explicit in
  the interface. No account trip is created by the device-save action.

## Final verification

| Check | Result |
| --- | --- |
| All Journeys Node tests | 1,611 passed; no failures/skips |
| Real Next homepage + traveller browser suite | 25 passed |
| Existing creator browser fixture | 13 passed |
| Source-package Python tests | 10 passed |
| TypeScript | Passed |
| Changed-file ESLint | No errors; 3 hook warnings in GuestPlanner |
| Production build and source archive | Passed with backend capabilities disabled |
| Independent review/recheck | Pending editor-save cancellation issue fixed; no remaining actionable findings |

Chromium checks use real IndexedDB, reload/reopen, edit/delete, lost-readback retry,
initial and edited-save cancellation, account changes, and 320/390/768/1280 px
layouts. The old creator suite uses its existing simulated backend. Neither suite
is evidence of live Auth/DB/RLS acceptance.

Observed failures before fixes: missing handoff entry, unsupported manual device
records, and an edited-copy save persisting after account invalidation. Regression
tests now pass. A fault-injection helper initially held its own verification read;
restricting it to the intended single open corrected the helper without removing
the persisted-state assertion. The actor-change unit scheduler also requires its
usual explicit post-effect render.

Main commands from `apps/journeys`: Node's full `tests/*.test.mjs` suite;
`playwright test --config playwright.home.config.ts` with system Chromium;
the existing studio fixture suite; `python -m unittest discover -s tests -p
source_package_test.py`; `tsc --noEmit`; changed-file ESLint; and `npm run build`.
Raw local logs, before-fix reproductions and screenshots are kept under
`.local-private/trip-draft-phase-20261104` alongside the pre-phase file snapshots.

## Delivery boundary

Changes remain local and uncommitted, building on the previous homepage phase.
This phase saves device itineraries, not every studio brief. Cloud synchronization,
native database/provider acceptance and deployment remain separate. No database
initialization, migration, capability activation or provider connection ran.

## Follow-up: device list feedback

Continuing the same traveller journey exposed a silent result when explicitly
reading an empty device-draft store. The existing status now announces loading
and a completed empty result in English and Traditional Chinese. Unreadable
copies retain their recovery warning. The homepage now distinguishes device
saving from the separately confirmed account import.

Two new Chromium cases reproduce the prior blank status, delay the real
IndexedDB open, and verify loading, disabled duplicate reads, empty completion,
retry availability and no saved trip rows. The full homepage/trip suite now has
27 passing cases; all 1,611 Journeys Node tests, TypeScript, production build and
the 10 source package tests pass. The Windows ZIP was refreshed from the verified
source archive. Changed-file lint has no errors and one existing effect
cleanup warning in ImportPreview. Independent review found no actionable issues.
Raw evidence is in `.local-private/device-feedback-phase`. This work does not
establish that the Windows launcher has run on the user's computer.
