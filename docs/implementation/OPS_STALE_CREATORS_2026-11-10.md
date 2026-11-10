# Per-creator stale-queue visibility

**Status:** deployed and verified in production. Release 2bffc7b, ledger **262** (`20261110110000`), deployment dpl_9xvAnZe5qfBeNyJP2HW3eGUzMchu.

## What shipped

`kinnso_ops_booking_health()` now returns `staleCreators`: up to ten creators with requests older than 72 hours, each with a pending count and oldest age. The booking-queue ops check appends the slowest creator to its degraded detail, e.g. `… 1 pending older than 72h (KinnsoOS Editorial: 1 pending, oldest 100h)`. Names fall back from display name to handle to a short creator id, so a missing profile name cannot hide the queue.

## Verification

- Local 3/3: two stale rows (80h/100h) for one creator plus a fresh row produced degraded detail `2 pending older than 72h (kinnso-fixture: 2 pending, oldest 100h)`; the ops readiness page rendered the same line; deleting the rows restored `ok` with no creator suffix.
- Production: a single 100h fixture row for the editorial creator produced `degraded … 1 pending older than 72h (KinnsoOS Editorial: 1 pending, oldest 100h)`; the fixture was deleted, the check returned `ok`, and the ledger/function state read 262 with `staleCreators` present.

## Limits

Only the slowest creator is shown in the check detail; the full list is RPC-only (no UI list). The line names the creator but cannot open their profile.
