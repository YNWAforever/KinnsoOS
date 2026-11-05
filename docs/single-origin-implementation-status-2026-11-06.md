# Single-origin implementation checkpoint — 2026-11-06

Status: implementation in progress; not a cutover candidate.

Canonical target: `https://kinnso-os.vercel.app`, served by KinnsoOS `apps/journeys`. Production, database policies, deployed Journeys, provider settings and labeled records have not been changed by this checkpoint. Backup/restore remains waived.

## Implemented locally

- Method-safe locale and creator aliases, including dotted handles and Unicode identifiers. Redirects preserve refreshed cookies and query parameters; mutation requests and auth callback paths are excluded.
- Exact campaign resolution through current-actor and active-membership checks plus the native campaign RPC. Supports authorized marketing members and paused campaigns without selecting the first company by default.
- Anonymous published-guide slug resolution followed by the existing UUID publication checks. Missing, ambiguous and withdrawn publications do not render.
- Native public-creator pagination with bounded, published-only guide reads; article and creator metadata use the canonical KinnsoOS origin.
- Creator insights page using the existing `creator_insights` RPC, validated metrics, preserved tier thresholds and accessible metric tables. No schema or provider activation.
- Locale auth callback delegates internally to the existing callback handler. Same-origin return validation and recovery checks are retained; duplicate credentials are rejected.

## Evidence

- Full local Journeys suite: **1,319 passed, 2 skipped, 0 failed** (1,321 total). The skips are not acceptance passes.
- TypeScript passed after the review fixes and callback addition.
- Production-mode webpack builds passed. The checkpoint build additionally verifies the encoded callback-path exclusion.
- Reviewer identified two concrete issues (marketing membership and identifier normalization); both were corrected and regression-tested. Follow-up review reported no new concrete security findings; live provider/browser acceptance was not performed.
- Browser fixture expectations were updated for canonical metadata and pagination, but these connected tests have **not** run against this checkpoint.

Private local logs: `.local-private/single-origin/`. Those artifacts are not production acceptance evidence.

## Remaining release gates

The [104-route matrix](legacy-route-matrix.json) records pinned legacy source blobs, imported contracts and unresolved parity. Native route recognition alone is not acceptance. Remaining work includes public-language and content parity, creator/session/tier/perk routes, merchant and operations capabilities, API ownership, old-origin draft recovery and explicit retirement mappings.

The earlier isolated suspension-test containers are absent. The running pilot backend has not been substituted. Provision and attest an owned candidate-specific backend before connected/browser writes. Preserve the shared-backend labeled campaign's paused status and the approved submission.

After parity implementation: rerun full migration/backend/browser/device checks, freeze the exact source and deployment/configuration envelope, then obtain scoped production cutover approval. Do not retire the old host or redirect uncovered routes based on this checkpoint. Paid AI, media/uploads and money/provider activation remain gated.
