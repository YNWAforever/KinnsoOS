# Optional timing for saved manual trips

Travellers can now enter or clear a start time and duration on each saved manual
stop. Start times use 24-hour HH:mm, from 00:00 to 23:59, in the trip's time zone.
Durations accept whole minutes from 1 to 1440. Blank means unknown; midnight
remains distinct as 00:00. Times are not automatically sorted or shifted, and
late stops may extend beyond midnight.

Partial input remains visible while editing and follows its stop through
reordering or moves to another day. Invalid times show English/Chinese field
feedback and block Save and save-and-leave before storage is touched. Correcting
or clearing the input allows the existing save/readback flow to proceed. Notes,
dates and the device record identity are preserved.

The existing time parser/formatter is reused. Raw input lives on transient keyed
edit stops; snapshots strip it along with the keys. Canonical times update only
when both fields are valid. Snapshot stripping also permits explicit deletion
of a copy with invalid unsaved input. Guide-derived schedules keep their existing
behavior. Timing handlers use stable stop identity, account generations and the
existing write/readback lock.

## Verification

Four new model cases and eight new component cases first failed against the
missing behavior, then passed. The full 1,667-test Node suite passes. New real
browser cases in English at 390px and Chinese at 320px verify invalid Save and
save-and-leave, unchanged IndexedDB before Save, midnight, maximum duration,
cross-day movement, private notes, reopening and clearing saved times.

All 45 browser regression cases pass. TypeScript, the production build and ten
source-package tests pass. Lint reports zero errors and the same three existing
GuestPlanner effect warnings. The source and local Windows archives pass hash
and byte readback checks against all six changed app files. The only source
change after the full Node run was a translation tuple type annotation; the
final browser suite, typecheck and build verify that source.

Fresh scoped review found no material defects and declined no behaviors. It was
read-only, with test execution handled by the implementer. Invalid-timing stop
removal and a subsequent stale callback are supported by the individual model
guards and inspection, rather than a dedicated combined browser scenario.

Final command results and source/package fingerprints are recorded under
`.local-private/stop-timing-phase-20261104`.

## Delivery boundary

The continuation remains local and uncommitted on `work` over `807714e`. Browser
verification uses fresh synthetic device data and disabled backend capabilities.
There is no live backend or authentication acceptance claim. No remote push,
database change, deployment or external upload is included. Windows package
delivery remains paused.
