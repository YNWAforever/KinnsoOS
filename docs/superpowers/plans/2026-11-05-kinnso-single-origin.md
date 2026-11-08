# KinnsoOS Single-Origin Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve preserved legacy functionality through KinnsoOS at https://kinnso-os.vercel.app without regressing Journeys.

**Architecture:** Keep apps/journeys as the serving app. Resolve route/identifier conflicts explicitly, port missing capabilities into native modules, and retire old-origin mutable entry points only after parity verification.

**Tech Stack:** Next.js 16.3.8, React 19.2.4, Supabase SSR/RPC/RLS, Node test runner, Playwright.

**Spec:** docs/superpowers/specs/2026-11-05-kinnso-single-origin-design.md (approved 2026-11-05).

## Global Constraints

- Canonical public origin: https://kinnso-os.vercel.app.
- Preserve existing Journeys behavior and all labeled test records.
- Backup/restore remains waived, not passed.
- All functional legacy routes and public languages are mandatory except explicitly gated paid AI, uploads/media, financial/provider/payout activation.
- No production cutover, origin retirement or new schema execution before exact-release approval.
- Existing shared Supabase identifiers and suspension enforcement remain authoritative.

## Review Focus

- Foreign-company or duplicated campaign query parameters must never silently select another company (Tasks 1–2).
- Old public slugs must never reveal unpublished guides (Task 3).
- Locale normalization and auth return paths must not create open redirects or silently translate unsupported languages (Tasks 1, 4).
- Unknown mutation outcomes must retain command identity; completed submissions must not be reversed (Tasks 2, 5).
- Redirect retirement must not drop old-origin drafts or redirect mutation requests (Tasks 4, 7).

### Task 1: Explicit route compatibility and exhaustive inventory

Files: create apps/journeys/lib/routing/legacy-entry.ts, apps/journeys/tests/legacy-entry.test.mjs, docs/legacy-route-matrix.json; modify apps/journeys/proxy.ts.
Interfaces: legacyEntry(pathname:string, method:string): {pathname:string; campaignId?:string}|null; preserves only known equivalent page families. Non-GET/HEAD, malformed paths, unrecognized locales and unknown mappings return null.
- [ ] Write failing tests for en/zh-hk normalization, creator and merchant aliases, exact UUID campaign preservation, unsafe encodings, mutation methods and unsupported locale non-fallback.
- [ ] Run node --experimental-strip-types --test apps/journeys/tests/legacy-entry.test.mjs; verify failures before implementation.
- [ ] Implement pure mapping; wire safe redirects only for equivalent pages, retaining query parameters and SSR cookie refresh. No broad proxy.
- [x] Create all 104 matrix rows with distinct native-equivalent, port-required, identifier-resolution, excluded-gated or operational dispositions; do not mark unverified rows passed.
- [ ] Rerun mapping and proxy regressions; commit.

### Task 2: Real merchant campaign deep links

Files: create apps/journeys/lib/merchants/campaign-entry.ts and tests/campaign-entry.test.mjs; modify app/[locale]/[[...route]]/page.tsx, app/travel/routes.ts and native merchant entry wiring as necessary.
Interfaces: resolveMerchantCampaignEntry(client,actorId,campaignId) resolves an authorized campaign to {merchantId,campaignId} through the native membership-aware get_kinnso_merchant_campaigns RPC; foreign/missing/suspended access returns null. Canonical destination is /:locale/merchant?company=<id>&campaign=<id>. No first-company fallback for a requested campaign.
- [ ] Write failing owner/two-company/foreign/anonymous/malformed/suspended tests.
- [x] Implement exact campaign lookup and active membership validation, then canonical native workspace entry.
- [ ] Verify paused campaign and approved work can be read; duplicate and stale review attempts retain status/history.
- [ ] Run focused tests plus TypeScript; commit.

### Task 3: Published guide identifier compatibility

Files: create lib/seo/legacy-guide.ts and tests/legacy-guide.test.mjs; modify lib/seo/guide-publication.ts and app/[locale]/[[...route]]/page.tsx.
Interfaces: resolvePublishedGuideId(slug:string,env,transport=fetch):Promise<string|null>; anonymous published-only read, exact slug, bounded response, no draft/session bypass.
- [ ] Fail tests for published slug, unknown slug, unpublished rows, unsafe input, duplicate matches and transport failure.
- [x] Resolve slug to published ID, retain existing UUID publication renderer and metadata checks.
- [ ] Test revoked publication between resolution and render; commit.

### Task 4: Public content, locale and auth parity

Files: lib/routing/legacy-entry.ts, lib/seo/public-article.ts, app/travel/routes.ts, native public presentation and auth/callback modules; per-family tests alongside existing suites.
- [ ] Complete matrix by inspecting each remaining public route and dynamic identifier contract.
- [ ] Port missing published destinations/session/profile presentation and legacy-language content without fabricated translations or weakening visibility.
- [ ] Add auth callback aliases only with validated same-origin return paths, token-safe handling and existing password-recovery behavior.
- [ ] Inventory old-origin drafts; implement reviewed user-mediated recovery/export before any retirement.
- [ ] Verify published and hidden controls, locale canonical links, recovery and malformed query tests; commit by family.

### Task 5: Remaining creator, merchant and operations parity

Files: native app/travel workspaces and lib/creators, lib/merchants, lib/ops service modules; missing exact files selected from the matrix as each family is traced.
- [ ] Trace every remaining non-gated legacy action to its native equivalent; record actual request/data contract before edits.
- [ ] Port missing guide/session management, creator insights/tier/perks, merchant profile/offers/team/read-only records and operations directories/reviews without enabling optional providers.
- [ ] For each port: write behavioral failure, implement smallest native equivalent, run ownership/role/revocation/stale-response/duplicate/interrupted-save tests and commit.
- [ ] Keep broader role changes and completed-work reversals in isolated tests only.

### Task 6: Connected acceptance and review

Files: scripts/run-native-release-browser.mjs; apps/journeys/tests/real-integration; candidate attestation/evidence under .local-private.
- [ ] Build and attest final candidate against an owned isolated backend; run full required chain and connected browser scenarios.
- [ ] Repeat two-account creator/merchant/operations/inbox lifecycle and new deep links with synthetic owned fixtures; distinguish shared-backend labeled-record checks.
- [ ] Run existing Journeys suites, TypeScript, build, mobile/keyboard checks; fix failures and request fresh whole-branch review.
- [ ] Update matrix with evidence; any required unresolved row blocks old-host retirement.

### Task 7: Exact cutover package

Files: docs/single-origin-release-review.md and separate old-host redirect artifact prepared after route parity.
- [ ] Freeze SHA, project/build-root bindings, callback/env diff, method-aware redirect map, test results and rollback targets.
- [ ] Verify safe GET/HEAD mappings, reject mutation forwarding and redirect loops; preserve old recovery access until completed.
- [ ] Obtain production approval only for the concrete package. Deploy canonical first, verify, then retire old public entries; no production work before approval.

## Execution ledger

Approval authorizes implementation, not a public launch. Execute natively in the isolated codex/single-origin-design-20261105 worktree, preserving the released source. Tasks 4–5 are intentionally inventory-driven: implementation filenames and regression commands are written to the ledger before each family starts; they are not permission to guess parity or omit routes.
