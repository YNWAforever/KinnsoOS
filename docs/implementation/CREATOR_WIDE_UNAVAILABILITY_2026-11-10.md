# Creator-wide unavailable dates

**Status:** deployed and verified in production. Release 8bf3630, ledger **256** (`20261110050000`), deployment dpl_FGjtia6892LR528VGi5b9azbJy1k.

## What shipped

A creator can block one range across every guide they own via the editor **All my guides** checkbox. A null `guide_id` means creator-wide; the creator list, the public guide read, the request-to-book check and the blocked-date notifications all honour those rows. Removing a creator-wide row clears it from every guide at once. Existing per-guide rows are unchanged.

## Verification

- Local 7/7: editor checkbox creates an all-guides row, the range is publicly visible on two guides, a request on the second guide inside the range is refused while outside is accepted, the pending traveller is notified, and removal clears both guides.
- Production E2E: the editor exposed the All my guides toggle, the block appeared as an all-guides row, public reads on Bangkok and Bali both included it, a traveller request on Bangkok inside the range was refused with 400, and removal left both guides clean (200, empty ranges).

## A merge and a lint miss

The production branch (`codex/guide-recovery-workspaces-20261105`) had three hotfix commits not in the release line, so they were merged before deployment; the only conflict (OpsWorkspace permission text) was resolved in favour of the newer release-side explanation. That merge carried an unused `payload` binding into BookingRequestPanel, which the CI lint gate caught; it was removed and the release redeployed.

## Limits

Advisory blacklist, not a calendar — no capacity, slots or instant booking. A creator-wide range cannot overlap another creator-wide range but may overlap per-guide ranges; requests see both and the stricter row wins. Still capped at 40 future rows per creator and 61 days per range. Notices remain in-app only.
