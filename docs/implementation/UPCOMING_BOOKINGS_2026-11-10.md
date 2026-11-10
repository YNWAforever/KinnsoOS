# Booking lifecycle B2 — upcoming trips

**Status:** deployed and verified in production. Release d5b784d, ledger **268** (`20261110170000`), deployment dpl_Hwo3SchetNv5wUa6RTB9fhKeKAG7.

## What shipped

- `kinnso_upcoming_bookings(days=3)` returns the actor's accepted trips starting within the window, for the traveller and creator separately; derived at read time.
- Traveller tracker gains a Starting soon section with a days-to-go count; creator studio gains Trips starting soon.
- No notification rows, event types, mutes or email are involved, so this cannot double-notify or add delivery risk.

## Verified

- Local 4/4: both APIs return only the two in-window accepted trips soonest first (0 and 2 days), excluding an unaccepted trip and a 10-day trip; both UIs render two upcoming rows.
- Production: both upcoming endpoints answer 200 with zero items (nothing starts within three days); the traveller page correctly renders no section; ledger 268.

## Limits

Read-time only: no email, push or inbox notification, so users who do not open the page are not reminded. The window is fixed at three days, and creators still see no traveller identity.
