# Per-event in-app notification mutes

**Status:** deployed and verified in production. Release 0d99140, ledger **257** (`20261110060000`), deployment dpl_6MXr6EmnCRvZ4fe5PfMEpqELkPTg.

## What shipped

A signed-in account can mute any of the five booking notification types (new request, withdrawal, accepted, declined, blocked dates affecting my requests) on the inbox page. Mutes are per account and per event type, applied when the inbox event is inserted, so muted notices never grow the unread count. The existing email opt-out is untouched.

## Verification

- Local 6/6: traveller mutes blocked-date notices in the UI → creator blocks overlapping dates → no notice; unmute → a later block notifies; creator mutes new-request notices → a traveller request adds no creator notice; unknown event type rejected with 400; all five types listed.
- Production E2E: the settings panel renders in both traveller and creator inboxes; the mute survives a reload (`afterOn=true`, `persisted=true`, `checkedAfterReload=true`); toggling back restores the unmuted state. The E2E mute row was deleted afterwards, leaving the table empty.

## Notes

The first UI attempt used a fully controlled checkbox with an async update, which Playwright rejected because the checked state only changed after the request resolved. The toggle now updates optimistically and rolls back on failure.

## Limits

Mutes cover booking events only; report and support notices stay always-on. Muting removes the inbox record entirely (no read-it-later digest). Email delivery is still unconfigured.
