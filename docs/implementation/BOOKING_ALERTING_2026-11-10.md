# Stale booking-queue alerting and waiting age

**Status:** deployed and verified in production. Release ae1bc31, ledger **261** (`20261110100000`), deployment dpl_6Fq9MNLnSXzug2WpqRGrA28r6sEw.

## What shipped

- `kinnso_public_health` now returns `pendingBookingRequests`, `stalePendingBookingRequests` and `oldestPendingBookingHours` (counts and age only, no identities).
- The scheduled health alert emits a labelled **booking-queue-stale** state once a day at 08:00 UTC when any request has waited longer than 72 hours; the drill endpoint accepts the new state.
- The creator inbox shows each pending request's waiting age (「已等待 Nh」) and turns it dark red with `data-overdue="true"` past 72h.

## Verification

- Local 3/3: the cron snapshot carried pending 2 / stale 1 / oldest 80h; a simulated booking-queue-stale drill was delivered to the webhook with the new state; the studio showed 已等待 1h (data-overdue=false) beside 已等待 80h (data-overdue=true).
- Production: the public snapshot returned pending 0 / stale 0 / oldest 0 after the migration; a real pending request showed 已等待 0h in the creator inbox; the booking-queue ops check stayed green; the test request was deleted afterwards.

## Limits

The stale alert fires once a day in the 08:00 UTC window, so a queue that becomes stale later waits up to a day for a warning. The alert names no creator. Production delivery was not re-triggered because CRON_SECRET is not available in this session; the drill path was proven locally and the earlier alerting receipts validated the destination.
