# S6a — Booking requests without payments

**Status:** deployed and verified in production. Ledger **250** (`20261109210000`), deployment `dpl_6UvPRX4AZ3s9VGfzV51pu4K9bBqN`.

## What it does

- A signed-in traveller on a published guide can **request a date** (start, optional end, party size 1–20, optional message).
- The owning creator sees the request in the **studio inbox** and can **accept or decline**.
- The traveller can **withdraw** a request while it is still undecided; a decided request cannot be withdrawn or re-decided.
- Five requests per traveller per rolling 24 hours; self-requests on one's own guide are refused.

## What it deliberately does not do

- No payment, no amounts, no provider, no "confirmed booking" status: the product calls it a **request** everywhere.
- No contact-detail collection. The panels say the traveller should include a way to be reached in the message if they want a follow-up.
- No notifications or email; the decision is visible in-product.

## Verification

- **Local API acceptance 14/14**: anonymous 401, create 201, past date/party validation, rate limit 429, traveller list, self-request 400, creator inbox, accept, double-decision 409, traveller sees decision, accepted cannot be withdrawn, undecided can.
- **Production E2E**: a verification traveller account requested a date through the guide-page UI; the editorial creator saw it in the studio inbox and accepted it; the traveller then saw "accepted". Signed-out visitors see the sign-in CTA. The arrangement copy is present on the promoted page.

## Honest limits

No payment or contract; accepted means the creator will arrange details. No traveller identity is shown to the creator, so follow-up depends on contact volunteered in the message. A test request and verification accounts exist in production and should be removed before real users.

## Phase position

This is the conservative first step of S6: request-to-book with no money movement. Instant booking, payments, payouts and tax remain product decisions (provider, custody, merchant KYC, refunds).
