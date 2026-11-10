# Creator unavailable dates

**Status:** deployed and verified in production. Release bd5ff5b, ledger **254** (`20261110030000`), deployment dpl_XQiFdno7m5LwCFVHWsjurJMdjxnD.

## What shipped

- Creators block date ranges per guide in the editor (Unavailable dates); overlapping ranges are refused with 409.
- The public guide page lists upcoming blocked ranges and the request panel refuses overlapping requests locally; the database refuses them too (400).
- Blocking never publishes, books, charges or changes visibility — it only narrows which requests are acceptable.

## Verification

- Local 10/10: editor add/remove, public read, overlap conflict, request inside blocked dates refused, outside accepted, non-owner 403, requestable again after removal.
- Production E2E: creator blocked 30 Nov–1 Dec in the editor, public read returned the range, the traveller guide page displayed it, an overlapping request was refused with 400, and cleanup left the public range list empty.

## A defect CI caught

The availability loading line used role=status inside the creator editor, colliding with the editor save-status role the connected E2E asserts on; strict mode failed 3 specs. The fix keeps aria-busy but drops the duplicate role.

## Limits

Advisory blacklist, not a calendar: no capacity, slots or instant booking. Ranges are per guide (no creator-wide holiday calendar), and blocking/removing sends no notification.
