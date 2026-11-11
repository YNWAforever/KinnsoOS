# Phase 6 P1b — creator flat guide price UI

**Status:** deployed and verified in production, inert (flag off). Release `e3bbd68`, ledger **270** (`20261111120000`), deployment `dpl_EwdY35kSJNhg7W9bNNiiaQkua6ZG`.

## What shipped

- `public.kinnso_creator_guide_price(uuid)` — owner-only read of one guide's flat price plus the payments runtime flag (HKD, 1.00–100,000.00, nullable), granted to authenticated.
- Studio price panel (`GuidePricePanel`) inside the creator guide editor: HKD amount, Save/Clear, format, range and unconfirmed errors, English/zh-HK copy. It renders nothing unless the payments flag is enabled.
- `GET /api/creator/guides/[id]/price`; the existing `PUT` now validates the bounded payload and maps `payments_disabled`.
- `kinnso_creator_set_guide_price` now requires an active creator and refuses while the payments flag is off, so production is inert even for a direct authenticated call — the UI gate is not the only control.
- The studio write guard ignores `price_minor`: a price-only update no longer demands a studio handoff, while every content and identity field stays guarded. `price_minor` is still absent from the authenticated column grant, so the owner-only RPC remains the single write path.
- `kinnso_ops_payments_status` reports `pricedGuides` so enabling payments can be audited first.

## Verified

- Local 15/15 against the public-it stack and a production build: flag-off read/write refusal and hidden panel; flag-on read, typed `750.50` saved as `75050`, reload, format and range refusals leaving the saved value intact, traveller 403 on read and write, a price-only update on a studio-bound guide succeeding without a studio handoff, clearing, flag-off regression, and fixtures restored (`0|0|false`).
- Unit/gateways: 2,056 unit tests pass (0 fail, 2 skipped) including new price parse/format and route cases; `tsc --noEmit` clean; ESLint 0 errors on the changed files.
- Production (8/8, read-only): health up; the new GET needs a session (401 anonymous, 405 on the previous deployment); payments stay disabled with `pricedGuides: 0`; the owning creator reads `paymentsEnabled:false, priceMinor:null`; a direct write is refused (403 FORBIDDEN); a traveller is refused; state unchanged; the alias serves `dpl_EwdY35kSJNhg7W9bNNiiaQkua6ZG`.
- Database: ledger 269/`20261110180000` → **270**/`20261111120000` inside one guarded transaction (baseline, catalog and post checks; `KINNSO_COMMIT_ACK_PAYMENTS_P1B_20261111`); flag still false, 0 priced guides, 0 payment rows, 8 published guides.

## Limits

- No traveller-visible price and no checkout: setting a price has no user-facing effect yet, and null means "no price" (no payment obligation), not "free".
- The flag is read per panel mount; toggling it needs a reload. A hidden panel also means a creator cannot clear a price while the flag is off — ops should audit `pricedGuides` before enabling.
- Price is not versioned: changing it affects future acceptances; existing `booking_payments` rows keep their amount snapshot.
- Studio-bound guides are covered by a catalog check plus a local bound-guide acceptance case, not by stack-wide production content.
- Live money is still P5: legal entity, Stripe account/KYC, payout bank, cancellation text and test keys.
