# Blocked-date notifications

**Status:** deployed and verified in production. Release 960c425, ledger **255** (`20261110040000`), deployment dpl_AzzbkrW635g3cuEfrXcDfEFZ1Lnd.

## What shipped

When a creator blocks a date range, travellers whose still-pending requests intersect that range receive an in-app notification (`booking.dates_blocked`) linking to their request tracker. The request keeps its status: this is a notice, not an automatic decline or refund.

## Verification

- Local 6/6: pending request created, creator blocks overlapping dates, traveller inbox shows the notification linked to /requests, request status stays `requested`, and a non-overlapping block creates no extra notification.
- Production E2E: traveller request created → creator blocked the same date → traveller inbox showed one matching notification with link `/zh-HK/requests` → request stayed `requested` → blocked range removed. The test request and its inbox events were then deleted, so production has no rows from this run.

## Limits

Notice only (no auto-decline/refund); only requests pending at block time are notified; in-app only (no email); ranges remain per guide, not a creator-wide holiday calendar.
