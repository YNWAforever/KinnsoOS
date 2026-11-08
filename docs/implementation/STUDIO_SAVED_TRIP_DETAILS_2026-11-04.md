# Saved device trip details

The next traveller increment adds editing of saved manual-trip metadata in the
existing GuestPlanner: trip title, optional start date, time zone and day titles.
Stop order, notes, identity and manual origin are preserved. Guide-derived copy
metadata/source/version remains unchanged.

## Saving and recovery

Edits remain in the current tab until Save. Invalid manual titles, dates or time
zones leave the previous stored copy intact, retain the input and keep account
import unavailable. An unset date is supported. Existing stop/note repair is kept.

GuestPlanner now confirms saves with both the IndexedDB transaction and an exact
readback matching ID, owner and content. A missing, stale, mismatching or failed
read keeps the editor dirty for a same-identity retry. No parent callback, import
link or successful navigation is released before confirmation. Newer edits made
while writing/reading remain unsaved. Account changes/unmount cancel writes and
ignore late reads without unlocking a newer operation.

## Verification

- 1,635 Journeys Node tests pass, including metadata validation, write-versus-read
  acknowledgement, missing/mismatched/error readback, retry identity, newer manual
  trip/day title edits during readback and unmount/account-change races.
- All 36 real Next/Chromium homepage/trip cases pass. New English and Traditional
  Chinese cases edit multiple-day metadata, save, reload, select the renamed copy
  and reopen all fields with notes and order intact. Invalid-zone changes leave
  the original record intact; a forced readback failure retries the same copy.
- The two metadata scenarios were rerun at 390px and 320px, including horizontal
  overflow checks. Both pass. Existing 320/390/768/1280 planning checks still pass.
- Ten source-package fixture tests, TypeScript and production build pass. Lint
  has zero errors and three existing GuestPlanner effect warnings. Corresponding
  source hashes and local Windows packaging readback pass; fingerprints are
  recorded in the final local verification JSON.

Focused tests first failed on the missing fields, missing validator and premature
success after transaction acknowledgement. The test storage boundary now models
write and read acknowledgement separately, while default successful transactions
also return their stored snapshot. This retains the existing concurrency tests.
The browser suite uses actual IndexedDB; it does not establish live database,
Auth, RLS or provider acceptance.

Fresh review found no material defect. Its suggested coverage for manual-field
races and unmounting during readback was added and passes. There are no deferred
review findings. Raw evidence and pre-phase snapshots are retained under
`.local-private/saved-trip-details-phase-20261104`.

## Boundary

This phase does not add saved-copy day/stop structure controls or account writes.
The existing dirty workspace is preserved, based on `807714e`; changes remain
local and uncommitted. No deployment or external upload ran. The paused Windows
delivery and rejected Drive transfer were not treated as authorized by this work.
