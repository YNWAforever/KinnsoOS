# Booking request status filters

**Status:** deployed and verified in production. Release 40af799, deployment dpl_EvFv1hMDmAPiUVhRSo3W4hveFCDg, ledger unchanged at **258**.

## What shipped

- Creator inbox: **All / Pending / Accepted / Declined / Withdrawn** chips with counts; each filter has its own empty state and `aria-pressed` state.
- Traveller tracker: **All / Waiting / Decided** chips with counts.

## Verification

- Local 6/6: three requests (pending, accepted with note, declined with note); creator chips read 3/1/1/1/0 and each filter shows only its status; traveller chips read 3/1/2 and Waiting/Decided filter correctly.
- Production E2E: creator chips read 5/1/3/1/0 (two older verification rows plus the three new ones); Pending showed only `requested` and Declined only `declined`; traveller chips read 5/1/4 and Decided showed no pending rows. The three E2E requests and their inbox events were deleted afterwards.

## Limits

Filtering is client-side over the up-to-50 rows each list already loads; there is no pagination or server-side filter yet.
