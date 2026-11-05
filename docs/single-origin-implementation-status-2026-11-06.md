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

Destination reader continuation: `public-destinations.ts` now provides anonymous,
bounded index pages and exact detail lookup against the existing
`security_invoker` destination view. It validates identifiers, counts and response
shape, rejects ambiguous identity, and distinguishes unavailable service from
empty inventory. Five focused tests and TypeScript passed; independent source
review found no concrete issue. This is a data-access checkpoint, **not a wired
destination page or backend acceptance**; the route matrix remains unchanged.
Related guide, experience, article and gated session sections must still be
ported together with their linked routes. Merchant attribution must use the
public projection, never the private merchant profile table. No database,
deployment, configuration or production record changes were made.

The [104-route matrix](legacy-route-matrix.json) records pinned legacy source blobs, imported contracts and unresolved parity. Native route recognition alone is not acceptance. Remaining work includes public-language and content parity, creator/session/tier/perk routes, merchant and operations capabilities, API ownership, old-origin draft recovery and explicit retirement mappings.

The earlier isolated suspension-test containers are absent. The running pilot backend has not been substituted. Provision and attest an owned candidate-specific backend before connected/browser writes. Preserve the shared-backend labeled campaign's paused status and the approved submission.

After parity implementation: rerun full migration/backend/browser/device checks, freeze the exact source and deployment/configuration envelope, then obtain scoped production cutover approval. Do not retire the old host or redirect uncovered routes based on this checkpoint. Paid AI, media/uploads and money/provider activation remain gated.

## Article continuation after 8048f8f

- Public article detail supports all seven existing languages with exact authored translations. Missing translations stay absent; no fallback content is invented.
- Article hub and category pages now render native listings using the existing anonymous `search_articles` invoker RPC. Keyword, region and tag filters survive pagination; duplicate/malformed controls and out-of-range pages are rejected.
- Existing navigation labels were copied from the pinned legacy dictionaries. Document language survives SSR and client navigation. All rendered article links and canonical metadata stay on KinnsoOS.
- Review found nullable-title and Thai combining-mark failures. Incomplete titles now keep RPC page positions/counts while displaying the source slug without a broken detail link. Valid combining marks are preserved.
- The built browser test exposed an additional encoded-slug 404 not caught by decoded reader fixtures. One-time decoding at the reader boundary fixes the actual Thai route while strict validation still rejects separators, traversal, malformed escapes and double encoding.
- Final local verification: **1,344 passed, 2 skipped, 0 failed**; TypeScript and production-mode webpack build passed. **28 local-fixture browser scenarios passed** across seven languages, mobile/desktop widths, JavaScript enabled/disabled, keyboard pagination, canonical metadata, missing-title records and Thai-slug navigation.
- Browser evidence uses a fresh browser profile and a synthetic loopback service started by `scripts/check-public-article-preview.mjs`. It is **not real Supabase, provider or authenticated workflow acceptance**. Private evidence is under `.local-private/single-origin/articles-preview/`.
- Follow-up source review confirmed the reported fixes and found no concrete security concern in the bounded decoding change.

The matrix now has 66 port-required routes, 17 native-equivalent candidates, 5 locally ported routes, 3 identifier-resolution routes, 5 operational routes and 8 gated activation routes. Local ports remain open release gates until connected and remaining functional parity checks pass. Production and backup/restore boundaries are unchanged.

## 2026-11-06 public destination phase evidence

- Accepted only the public article, creator, guide, destination, experience,
  merchant-attribution and session read families listed in
  `docs/public-destination-phase-envelope-2026-11-06.md`. All other routes,
  including experience booking and creator/session administration, remain
  release gates.
- Final code candidate for connected evidence:
  `3b48a23b35f74740276e6fcd20b44f7d8a938b1a`.
- Full local Journeys suite: 1,409 passed, 2 skipped, 0 failed. TypeScript
  passed. The production-mode webpack build passed. Default Turbopack remains a
  separate hosted-build gate because this worktree’s external dependency
  symlink is outside its filesystem root.
- Built local fixture browser checks passed 28 destination and 28 article
  combinations across seven public languages, widths 390/1280 and JavaScript
  on/off. Destination checks include axe, keyboard focus, reflow and unavailable
  states; these remain `LOCAL_FIXTURE_UI_ONLY`.
- A fresh candidate-specific Supabase project,
  `kinnsoos-public-it-20261106`, applied all 199 migrations on dedicated
  API/database ports 59721/59722. Five owned containers were attested by source
  archive, migration manifest, image, network, volume and app-process identity.
- Connected run `ffd297c8-43ff-4641-8041-e7c0d5eee9b9` passed exactly eight of
  eight cases: one per public language plus withdrawal, suspension and
  cross-account bookmark isolation. The post-run baseline returned to zero
  guides, experiences, sessions, articles and guide saves.
- Backup/restore remains waived. Production remains unchanged: no deployment,
  database change, feature-setting change, role grant, redirect, provider
  activation or old-host retirement occurred.
