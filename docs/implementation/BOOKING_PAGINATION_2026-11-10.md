# Booking request history pagination

**Status:** deployed and verified in production. Release ec991f5, ledger **259** (`20261110080000`), deployment dpl_83mMGXnW5Hw3ZrJw5zSpywmHd3Zu.

## What shipped

Both request lists used to stop at the newest 50 rows with no signal, so older requests silently disappeared. The two read RPCs now take limit/offset and return `hasMore`; the creator inbox (pending first) and the traveller tracker append older pages through a **Load older requests** control that disappears when the history is exhausted.

## Verification

- Local 6/6 with 60 seeded requests: both APIs returned 50 rows (`hasMore=true`) then 10 (`hasMore=false`); both UIs showed 50 rows, appended the remaining 10 on click, and hid the control afterwards. The creator page kept pending requests first (10 pending before any decided row).
- Production E2E: traveller and creator APIs returned the two real rows with `hasMore=false` and offset=1 returned one row; the traveller tracker rendered both rows with **no** load-more control. Read-only; no rows created.

## Limits

Offset pagination can shift if a request is created mid-paging; cursor pagination is future work. Each click loads 50 rows and there is no jump-to-end.
