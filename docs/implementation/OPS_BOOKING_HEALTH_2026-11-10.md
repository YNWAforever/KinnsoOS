# Ops booking-queue health check

**Status:** deployed and verified in production. Release 0343254, ledger **260** (`20261110090000`), deployment dpl_8TQyW1eohidQ9vLUpMi9snsych8m.

## What shipped

The ops readiness page now includes a **booking-queue** check backed by `kinnso_ops_booking_health()` (ops-gated, read-only): pending requests, their oldest age, stale pending older than 72h, accept/decline/withdraw counts in the last 7 days, active blocked date ranges and muted accounts. The check degrades when any request has waited longer than 72h.

## Verification

- Local 5/5: empty queue → `ok`; an 80-hour-old pending row → `degraded` with `pending 1 (oldest 80h) … 1 pending older than 72h`; the ops readiness page rendered that exact detail; deleting the row restored `ok`; a traveller account received 403.
- Production E2E: the check appeared in `/api/ops/health` as `pending 0 (oldest 0h) · accepted 7d 2 · declined 7d 0 · blocked ranges 0` and the readiness page rendered the same line. Read-only; no rows created.

## Limits

The check degrades only on requests older than 72h and raises no alert on its own (the alert destination is still the in-product inbox). The summary is global, not per creator.
