# Waiver expiry — making "no stale waivers" enforceable (L1 exit criterion)

**Status:** implemented and verified locally (11/11); committed, CI/deploy pending.

Date: 2026-11-09 · Parent: `3993c6b` (L3 evidence docs) · Production: `dpl_9k2hmX8F8UzzVVdChuUeAxMbQqjy`, ledger 245.

## 1. Why

Phase 4 exit says "launch-ready verdict with no stale waivers". Until now a waiver was a permanent note: once waived, a gate stayed satisfied forever and nobody could tell it had aged. This slice gives every waiver an explicit review date and makes an expired waiver block the launch again.

## 2. Delivered

- `launch_signoffs.expires_at` (additive column).
- `kinnso_ops_sign_off(gate, status, note, expires_at date)` — a waiver must carry a review date in the future within 90 days (`expiry_required`, `expiry_in_past`, `expiry_too_far` → 400); accepted decisions may carry an optional future review date; rejected never does.
- `kinnso_ops_launch_state()` now returns `expiresAt` and `stale` per gate (`status = 'waived' and (expires_at is null or expires_at < now())`).
- Launch API: stale waivers render as `blocked` with "waiver expired <date>", re-enter the blocker list and flip the verdict back to `hold`; the launch packet does the same.
- Launch panel: "Review by" date control appears for waivers (required) and accepted decisions (optional), the recorded date is shown per gate, and the stale state is visible.

## 3. Local verification (11/11)

- waiver without a review date → **400**
- waiver with a past date → **400**
- waiver beyond 90 days → **400**
- valid waiver (30 days) → **201**, gate accepted, verdict `launch-ready`
- an expired waiver (forced directly for the test) → gate **blocked** with "waiver expired 2026-11-07", verdict **hold**, `devices` in blockers
- launch packet reports the stale waiver in blockers
- UI shows the review-date control when "waived" is selected and renders the stale gate as blocked
- fresh waiver restores `launch-ready`

The invalid-input cases initially returned 503 because the POST route mapped every RPC error to UNAVAILABLE; the catch now maps `invalid_*`/`expiry_*` to 400 — a real defect caught by the acceptance run.

## 4. What this changes

"Launch-ready" can no longer be inherited from stale paperwork: every waiver carries the date it must be reviewed by, and the product re-blocks the launch when that date passes. That is the L1 exit criterion made mechanical.

## 5. Limits

- Expiry is enforced on the latest sign-off per gate; older rows remain as history (by design).
- The product cannot prevent an owner from waiving repeatedly; it only guarantees that each waiver has a bounded review date and expires visibly.
- No notification is sent when a waiver is about to expire (the daily digest covers content only); adding a waiver-expiry reminder to the scheduler is a possible follow-up.
