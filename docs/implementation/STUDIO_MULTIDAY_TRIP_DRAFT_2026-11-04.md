# Multiple-day traveller planning

The T1 homepage → review brief → prepare a trip draft flow now prepares an
itinerary with multiple days. This continues the existing device-draft story;
account storage and connected-service acceptance remain separate.

## Behavior

- Add and name up to thirty days, with one to twenty stops per day and at most
  two hundred stops overall. These match the existing recovery/import limits.
- Move days earlier/later without separating their titles and stops. Removal
  requires confirmation; cancelling preserves all fields and prior consent.
  The last remaining day cannot be removed.
- Editing, adding, moving or confirming removal clears the prior preview and
  storage consent. A later empty or invalid day blocks review without losing
  the other fields or writing a trip.
- Review shows every day and stop. Offsets follow the chosen order. The trip
  note is attached exactly once to the first stop of the final first day, even
  after removing the original first day. Schedules and source credit are not
  inferred.
- Explicit device confirmation, completed IndexedDB save and exact readback,
  same-copy retries and account/unmount cancellation remain unchanged. The
  existing editor reopens and edits stop titles/notes across every saved day.
  Previously saved single-day and guide-derived copies retain their data shape.

## Verification and corrections

All 1,619 Journeys Node tests and all 32 real Next/Chromium homepage/trip cases
pass. The browser cases cover adding, reordering, cancelling/confirming removal,
removing the first day, complete IndexedDB state, reload/reopen, subsequent edits,
invalid later days, bilingual use and 320/390/768/1280 px layouts. Pure tests cover
thirty versus thirty-one days, two hundred versus two hundred and one stops,
input immutability and existing recovery/import compatibility.

Fresh review found a long-title layout defect. A 200-character unbroken day title
reproduced horizontal overflow. Headings now wrap in both the preview and the
reopened device editor; the browser regression covers both locations.

An initial existing single-day reopening case timed out during navigation, then
passed unchanged in isolation and the final full suite. Another run exposed an
old label selector matching two notes fields after reload. The test now selects
the visible textbox by accessible role, preserving its cleared-input, storage
and URL privacy assertions. No timeouts or privacy assertions were relaxed.
One interrupted diagnostic run left an owned test server; only that exact
task-owned server was stopped before retrying.

TypeScript passes. Changed-file lint reports zero errors and three existing
GuestPlanner effect warnings. The ten source-package tests and final production
build pass. Corresponding-source hashes and local Windows packaging readback
pass. Evidence is recorded with file fingerprints under
`.local-private/multiday-trip-phase-20261104/verification.json`.

## Scope

Changes remain local and uncommitted on `work`, based on `807714e` plus the prior
continuation. No database, Auth, provider, remote repository or deployment was
changed. The Windows download/Drive transfer remains paused; development does
not authorize the previously blocked external upload.
