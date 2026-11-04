# Move saved manual stops between days

The device trip editor now lets a traveller choose another day and explicitly
move a stop there. The same stop is appended to that day, retaining its private
note and nullable time/duration. Keyboard focus follows its title. Selecting a
destination alone does not edit the trip; moves affect storage only after Save
and matching readback of the same device record.

Transfers preserve date offsets, including gaps, and allow an empty source day.
The destination remains limited to 50 stops. Moving is permitted at 200 total
stops because it does not add another stop. Unknown, removed or same-day targets
do nothing. Guide-derived structural data keeps its existing restrictions.

Destination choices and focus requests stay in memory, tied to the current
account generation. Account changes clear them, pending saves block moves, and
temporary editor keys never reach stored data or parent notifications. Labels
use the actual day number and title in English and Traditional Chinese.

## Verification

- Three model tests and four component tests first reproduced the missing
  transfer behavior. All 1,655 Journeys Node tests now pass, covering atomic
  transfers, preserved fields, capacity limits, stale destinations, account
  changes and pending-write/readback guards.
- All 43 real Next/Chromium browser cases pass. New English and Chinese cases
  at 390px and 320px verify explicit selection, unchanged storage until Save,
  focus, exact saved data, reopening notes and long destination titles.
- TypeScript, the production build and ten source-package tests pass. Lint has
  zero errors and three pre-existing GuestPlanner effect warnings.
- Source archive metadata hashes and the local Windows ZIP readback pass. Seven
  checked app files match the workspace in both archives.
- Fresh scoped review found no material defect. Component tests use synthetic
  account props and stub subscriptions; they do not establish every live account
  event race. Browser cases verify normal focus and device persistence. No live
  backend or authentication acceptance is claimed.

Phase snapshots, logs, package readback and exact source fingerprints are under
`.local-private/cross-day-stop-phase-20261104`.

## Delivery boundary

Changes remain local and uncommitted on `work` over `807714e`. The build uses
disabled backend capabilities. The Windows preview package is refreshed locally;
external delivery remains paused. No database, provider, deployment or external
upload changed.
