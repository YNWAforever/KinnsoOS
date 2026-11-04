# Multiple-day traveller drafts

Continue the authorized homepage → review brief → prepare a trip draft journey.
The current builder only prepares one day, although the device store, recovery
screen and account-import preview already support multiple days. This increment
lets travellers arrange their own trip before saving it.

## Scope and choices

Use the existing Next.js/React form and `GuestTrip` representation. The following
are implementation choices for the user's request to keep developing: one to
thirty days, one to twenty stops per day, and at most two hundred stops in total.
These fit the existing thirty-day/two-hundred-stop storage and import limits.
No new schema, dependencies, account writer or provider connection is needed.

Each day has an editable title and ordered stop names. Add a day, move it earlier
or later, or remove it after confirmation. At least one day must remain. Stable
form keys keep the right title and stops together when moving or removing days.
Day offsets in the prepared itinerary are consecutive, following the chosen order.

Changing a day, its order, or any other field invalidates preview and device-save
consent. The complete preview shows every day and every entered stop. Time and
duration stay unset; guide attribution is never invented. The optional trip note
remains attached once to the first stop of the first day, as disclosed in review.

The explicit checkbox, completed IndexedDB transaction and matching readback are
still required for success. Retry reuses the same device identity. Existing
navigation guards and cancellation on account changes/unmount remain in force.
Previously saved single-day and guide-derived copies keep their storage shape.
The existing device editor reopens and edits stops/notes across all saved days.
Changing day structure after the initial save is outside this increment.

## Alternatives

Extending the existing device form gives a complete local traveller story.
A separate planner would duplicate recovery and confirmation. Account-first
planning would require backend acceptance and access outside this continuation.
The existing form is the implementation choice; the user has asked to continue
development instead of pursuing download/setup questions.

## Acceptance and boundaries

- Pure preparation preserves day/stop order, normalizes offsets, keeps note bytes,
  never mutates input, and rejects missing/oversized days, stops and day titles.
- Real browser cases cover adding, removing/cancelling removal, reordering,
  invalidated consent, empty later days, save/readback, reload and later editing.
- English and Traditional Chinese controls work; multi-day previews fit the
  existing 320/390/768/1280 px checks.
- No text is stored before the device-save decision. Existing idempotent retry,
  pending-save cancellation, single-day and source recovery tests remain valid.
- Code, tests and corresponding-source packaging are local. No push, deployment,
  database migration or Google Drive upload is part of this work. The earlier
  download/Drive approval remains paused, with no assumed authorization.
