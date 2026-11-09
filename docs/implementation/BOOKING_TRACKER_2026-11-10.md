# Traveller booking-requests tracker

**Status:** deployed and verified in production. Release `e23ffc1`, deployment `dpl_6gDz7Zve3Ges2rAZuJWG9ub7FRgN`, ledger unchanged at 250.

## What shipped

`/{locale}/requests` lists every date request the traveller has made: guide (link), creator, dates, party size and status. Undecided requests can be withdrawn there; guests get a sign-in CTA; the guide-page request panel links to it. No new database objects — it reuses the booking-request APIs.

## Verification

- Local 4/4: guest CTA, five rows across statuses (withdrawn/requested/requested/requested/accepted), withdraw offered on requested rows, withdraw succeeds and the list reflects it.
- Production: the verification traveller signed in and saw **1 row, status accepted** — the request created in the earlier E2E.

## Limits

No notifications yet; status changes are seen only on revisit. No pagination (bounded by the 5/day rule). Verification accounts/test data still present.
