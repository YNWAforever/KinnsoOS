# Saved manual trip details

Continue the authorized traveller development in the existing device editor.
The multiple-day planner saves complete itineraries, but its recovery editor
currently only edits stop titles and notes. This increment lets a traveller
change a saved manual trip's title, optional date, time zone and day titles.

Use the existing GuestPlanner state, IndexedDB representation and import preview.
This is the implementation choice for continuing the current flow; a separate
editor would duplicate recovery and account-switch handling. Account-first
editing would require backend acceptance outside this local continuation.

Changes remain in the current tab until Save. Validate nonblank trip/day titles
up to 200 characters and the existing date/time-zone rules before writing manual
copies. Invalid input stays editable, the last saved copy is kept, and import
stays blocked while changes are unconfirmed. No new day/stop structure controls
are included. Guide-derived copy metadata remains unchanged.

All GuestPlanner saves must read back and compare the exact saved copy before
showing success, clearing dirty state, enabling import or notifying a parent.
Readback failure/mismatch retains edits and the original device identity for retry.
New edits while a write/read is pending remain unsaved. Account changes/unmount
cancel writes and ignore late reads. Existing guide-copy recovery, private notes,
provenance and nullable schedule fields are preserved.

Acceptance: pure validation boundaries; controlled write/read failure and stale
responses; real bilingual create/save/edit/reload/reopen; unchanged identity,
notes and day order; invalid changes do not overwrite the prior saved copy;
mobile layout and existing navigation/import gates continue working.

No dependency, schema, backend, remote repository, deployment or external upload
changes. Earlier Windows/Drive delivery remains paused. Preserve existing dirty
work and keep evidence under `.local-private/saved-trip-details-phase-20261104`.
