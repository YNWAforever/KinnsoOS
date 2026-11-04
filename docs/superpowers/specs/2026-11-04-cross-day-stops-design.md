# Move a saved stop to another day

Continue the authorized manual device-trip editor. A stop can currently move
only within its day. Add an explicit destination-day picker and move action for
each manual stop, reusing the existing editor model, save/readback and guards.

Moving appends the same keyed stop to the selected destination, removing it
from the source exactly once. Preserve its title, private note and nullable
time/duration, all day keys/offsets (including gaps), trip identity and metadata.
An empty source day remains a valid working day. No data is written until Save.
The destination cap is 50 stops; transfers remain allowed at 200 total stops
because the total does not increase. Unknown/stale/self targets are no-ops.
Guide-derived copies retain their existing structural restrictions.

Destination labels use actual day offsets and user titles. Staging a destination
does not mark the trip edited. Clear stale selections on structural/account
changes and bind selection/actions to the original account generation. Busy
saves block selection and movement. After transfer, focus the moved stop's title
in the destination, suppressing late focus after account changes/unmount.
UI keys, staged choices and focus requests are not persisted or sent to parents.

Verify immutable transfers, unchanged dates/notes/times, destination/full-trip
limits, stale targets, explicit selection, pending-save/account guards, bilingual
save/reload/reopen, keyboard focus and narrow layouts with long day titles.
No dependency/schema/backend/provider/remote/deployment/upload changes. Preserve
the dirty workspace and paused Windows delivery.
