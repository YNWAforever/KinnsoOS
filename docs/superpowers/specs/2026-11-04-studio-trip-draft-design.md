# Studio brief to traveller draft

The next increment after homepage-to-studio continuation closes the T1 planning
handoff. This is a bounded slice of CS3/T10: the traveller can turn their own brief
into a reviewed, editable itinerary saved explicitly on this device. It builds on
the existing guest planner and account-import preview.

## Product behavior

After reviewing a T1 manual brief, choose to prepare a trip draft. Enter a trip
title, optional start date, valid time zone, one to twenty stop names in order,
and an optional note. The brief initially supplies the editable note. Review one
day containing exactly those stops, with time/duration unset, before confirming
device storage. Editing any input invalidates the preview and confirmation.

The save must finish and read back the same copy before showing success. Failed or
unconfirmed saves preserve the fields and reuse the same device identity on retry.
Opening, previewing, or editing the form does not write private text to storage.
The shared-device disclosure is part of the storage decision. Navigation/unload
uses the existing unsaved-draft guard; account changes clear the active form and
cancel pending writes.

Once saved, use the existing GuestPlanner and /trips device-copy list to reopen,
edit, save, delete, and review account import. Device saves do not create account
trips. Import retains its existing explicit sign-in/confirmation and UUID handling.

## Architecture and choices

Use the existing Next.js 16.3.8/React architecture, IndexedDB guest store,
GuestPlanner, ImportPreview, calendar validation, and navigation guard. Add a pure
manual-draft builder and a small T1 handoff component. Existing manual task flows
remain reachable; fixtures with a TravellerStore keep their current execution.

Manual drafts need an explicit `origin: 'manual'` marker so they can have their
own date and no guide attribution. Legacy guide copies keep the existing source
rules. Mixed manual/source-tagged records are rejected. This is local data shape
validation, not an assertion of content rights. No source identity is fabricated.

Considered alternatives: cloud brief persistence would require a new metadata
contract because current studio creation accepts only creator templates; automatic
trip creation would bypass the existing review boundary. A device draft uses an
already functional editor and recovery path and completes a useful traveller story.
This scope/architecture is the implementation choice for the user's request to
develop the next phase; it does not claim completion of every CS3 task.

## Verification and limits

Cover calendar/zone/length limits, manual versus guide provenance, no writes before
confirmation, storage failure and same-copy retry, cancellation, reload/reopening,
editing/deleting, preserved private notes, account changes, keyboard/mobile use,
and the existing homepage/creator/guest-planner regressions. No dependency upgrades,
database initialization, migrations, capability activation, or deployment is needed.
