# Optional creator response notes

**Status:** deployed and verified in production. Release 728ca4f, ledger **258** (`20261110070000`), deployment dpl_H7Psp7D7pve4d5TMi56Ca4BYNrJs.

## What shipped

When a creator accepts or declines a request they can leave an optional note (max 500 characters). The note is stored on the request and shown to the traveller in their request tracker. No contact details are collected or required; notification behaviour is unchanged.

## Verification

- Local 5/5: two pending requests → creator declines one with a note and accepts the other with a note from the studio inbox → both notes appear in the traveller tracker → a 501-character note is rejected with 400 → the accepted notification still reaches the traveller.
- Production E2E: traveller created a request → creator declined with a note → the traveller tracker showed 「創作者備註: Production note…」 → a 501-character note was rejected with 400. The test request and its inbox events were deleted afterwards (counts 0).

## Limits

The note is optional free text shown in the tracker only (not emailed). Only accept/decline decisions carry a note; withdrawals do not. The notification still just says accepted/declined — the tracker holds the reason.
