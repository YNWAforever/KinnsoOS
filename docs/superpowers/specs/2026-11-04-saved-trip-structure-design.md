# Saved manual trip structure

Continue the authorized traveller journey by arranging days and stops in a saved
manual device trip. Reuse GuestPlanner, the existing record shape, verified save,
import gate and navigation/account guards. Do not create another planner/store.

Manual copies gain add/move/remove-day and add/move/remove-stop controls. Stops
move within their current day. Removing a day/stop explicitly confirms removal
of its contained private notes. Cancelling keeps all edits unchanged. At least
one day remains; a day may be empty while planning. Added stops start blank, with
no invented place, schedule or note. Incomplete stop names keep the existing
device-working-copy behavior and account-import repair requirement.

Use existing editor storage bounds: 30 days, 50 stops/day, 200 stops total.
Day-structure edits renumber offsets from zero, so days follow the chosen order
from the start date; disclose that behavior in the editor/removal confirmation.
Stop-only edits preserve existing offsets. Reordering preserves every surviving
note, title and nullable time. Guide-derived copies keep their current text/note
repair behavior; structural controls and commands are manual-only.

Stable editor keys keep the right focused controls/data together. Keys exist
only in cloned in-memory editor nodes and are stripped from snapshots before
storage, exact readback or parent notification. The existing writer still
validates recoverability. Existing
saved JSON and source claims do not change. Save/readback or account changes
must not acknowledge newer unsaved structure. Structural actions are blocked
while a save is pending, and pending removal is cleared on account invalidation.

Changes are memory-only until Save. Save still needs an acknowledged transaction
and exact readback for the same ID/owner/content. Retry uses the same copy.
Account import remains separate. No schema, dependency, backend/provider,
remote repository, deployment or external-upload work is authorized by this
increment. Preserve the existing dirty workspace; Windows delivery stays paused.

Verify pure edits, key stability/stripping, immutable inputs, boundaries, gaps,
notes/times, guide rejection; component save/race/confirmation gates; actual
bilingual save/reload/reopen and mobile layouts. Keep the existing full suites.
