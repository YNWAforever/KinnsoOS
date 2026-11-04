# Saved manual trip structure

Saved manual device copies now support adding/reordering/removing days and stops
in the existing GuestPlanner. Stops move within their day. Removing a day/stop
confirms removal of its contained private notes. Cancelling keeps the working
copy unchanged, and the last remaining day cannot be removed.

All structural changes remain in memory until Save and its matching readback.
Surviving notes, titles and nullable times follow their entries. Day changes
renumber dates from the start date, as disclosed in the editor and confirmation;
stop-only changes preserve existing date gaps. Empty working days and blank new
stops are supported without invented place data. The existing account-import
completeness checks remain separate. Editor bounds are 30 days, 50 stops/day and
200 stops total.

Transient editor keys stabilize React nodes. They are removed from snapshots
before storage, readback comparison and parent notifications. Persisted JSON,
device identity, guide credit/version and existing recovery contracts stay the
same. Guide-derived copies keep their existing text/note repair; their structural
controls and structural commands remain unavailable.

## Verification

- 1,648 Journeys Node tests pass. Pure tests cover immutable edits, stable/stripped
  keys, preserved notes/times/date gaps, 30/50/200 boundaries and guide rejection.
- The full 40-case real Next/Chromium suite passes. English at 390px and Chinese
  at 320px exercise typed stop names, both move directions, removal cancellation
  and confirmation, untouched storage before Save, exact saved data and reopening.
  Save-and-leave and discard guards preserve the correct device copy.
- A separate browser case verifies real DOM identity and focused control
  retention while moving both stops and days; it passes without a product fix.
- TypeScript, production build, ten source-package tests and source/ZIP readback
  pass. Lint has zero errors and three pre-existing GuestPlanner effect warnings.

Tests exposed stale removal confirmations and requests acting after an account
switch. Both are fixed: requests bind to the actor and confirmations bind to the
original generation. Structural actions are blocked during write/readback,
including captured earlier handlers. Existing dirty/revision/account/unmount
guards and same-copy unknown-save recovery continue to pass.

Fresh scoped review found no material defects; its requested direct focus test
was added. No findings are deferred. Phase snapshots, logs and exact source
fingerprints are under `.local-private/saved-trip-structure-phase-20261104`.

## Delivery boundary

The continuation remains local and uncommitted on `work` over `807714e`. No
database, provider, remote repository, deployment or external upload changed.
The refreshed Windows ZIP is local; its delivery remains paused. No authorization
was inferred for the previously blocked Drive upload.
