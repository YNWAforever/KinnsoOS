# Booking lifecycle B1 — trip completion

**Status:** deployed and verified in production. Release 3daa735, ledger **267** (`20261110160000`), deployment dpl_Eg5h6YMDhwXoVcYzUnjvqchvF7sb.

## What shipped

- Accepted requests can now reach a resting state: the owning creator marks a trip completed once its last day has passed.
- Server rule: only the creator of that request, only when `status = accepted`, only after `ends_on` (or `starts_on`) has passed. Early or repeated completion is a conflict.
- Creator inbox gains a Completed filter and a Mark trip completed button on finished accepted rows; the traveller tracker shows Completed.

## Verified

- Local 7/7: early completion 409; traveller completion denied; owner completes a finished trip and the traveller sees completed; repeated completion 409; unknown status 400; both UIs render the completed row under their filters.
- Production: creator inbox renders both accepted rows and exposes the Completed filter; traveller tracker loads both requests; ledger 267, zero completed rows (nothing mutated).

## Limits

Completion is manual, does not notify the traveller, and nothing auto-completes. The two pre-existing production accepted rows are left untouched for owner-led cleanup.