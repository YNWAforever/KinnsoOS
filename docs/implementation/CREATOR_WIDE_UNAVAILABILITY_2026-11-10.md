# Creator-wide unavailable dates

**Status:** database deployed (ledger **256**); app deployment pending Vercel authentication. Release 4e5f065, CI 42758264351 green.

## What shipped (code and database)

A creator can block one range across every guide they own via the editor All my guides checkbox. A null `guide_id` means creator-wide; the creator list, the public guide read, the request-to-book check and the blocked-date notifications all honour those rows. Removing a creator-wide row clears it from every guide at once.

## Verification

Local 7/7: editor checkbox creates an all-guides row, the range is publicly visible on two guides, a request on the second guide inside the range is refused while outside is accepted, the pending traveller is notified, and removal clears both guides.

## Deployment note

The Vercel CLI had no credentials at deploy time (empty auth file, no token in the environment). The commit was fast-forwarded to main and is forward-compatible with the previously deployed app: the old app only writes guide-specific rows, so production behaviour is unchanged until the app deployment lands.
