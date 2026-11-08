# KinnsoOS single-origin consolidation design — 2026-11-05

Status: design for review, not deployed. User selected consolidation into KinnsoOS rather than redirect-only. Canonical public origin: https://kinnso-os.vercel.app. Preserve existing Journeys behavior and all labeled test records. Backup/restore remains waived, not passed.

## Intent and chosen approach

One repository and one public app entry point should own travel, creator, merchant and operations workflows. Existing Journeys is the serving application; importing a second app must not replace its route tree or weaken its capability gates.

Approaches considered: (1) only redirect old URLs into current Journeys — smaller change but cannot preserve missing features; user declined in favor of consolidation. (2) consolidate legacy behavior into KinnsoOS and serve it from the current Journeys application — selected. (3) keep a second backend app behind a cross-origin rewrite — not selected because it retains the duplicate app and complicates cookies, server actions and origin checks. The builder may use shared internal modules, but not silently adopt the proxy approach.

Recommended implementation: keep apps/journeys as the canonical Vercel build root. Port verified missing legacy behavior into native modules/routes there, extracting reviewed shared code only when compatible. apps/web remains a reference until parity is accepted. Do not copy the whole legacy tree over Journeys or assume the existing KinnsoOS apps/web directory equals the deployed Remix app.

## Observed baseline

- Journeys production revision: 42be3ce4c7207b6ec11ec8c4bd85a5feaa6588ef, deployment dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs, project prj_Id1terbb37iQ5Ct3mg1VIhoVkOaW, root apps/journeys.
- Reviewed KinnsoOS source/evidence candidate: 2b62a3f378c48eb2e6b1144c3ec77da9d1020e1d. It descends from that serving revision. Root main is a different revision and has unrelated local changes; preserve it.
- Legacy production source: Remix-Kinnso b264c163b2d36083bab73200b84b8adf271e3e6e; deployment dpl_GMRTNd67F7cVc4eMczsheFgJacsu.
- Shared Supabase: scryfkefedzuetfdtrvl. Already deployed suspension enforcement remains authoritative. Do not replay or reverse its migration. No data copy is necessary merely to change app origin.
- Exact Git-blob comparison/inventory is in docs/legacy-consolidation-inventory-2026-11-05.json: 104 legacy page/API handler files. This is a filesystem route inventory, not proof of all runtime paths, slug parity, feature completeness or entitlement correctness.
- Journeys catch-all supports en and zh-HK. Legacy locales are en, zh-hk, zh-tw, ja, ko, th, zh-cn. Journeys rejects legacy/ paths and does not accept real merchant mission UUID detail paths through its existing demo detail matcher.
- Both apps use Supabase SSR, but Journeys resolves additional actor facts with kinnso_actor and explicit capability configuration. Never replace that with legacy role or session assumptions.
- Legacy guide paths use slugs; native Journeys publication reads IDs. Direct pathname rewriting is insufficient without an explicit identifier resolver.

## Route ownership and preservation contract

Journeys retains ownership of its existing routes and API handlers. Resolve collisions before importing code. For each of the 104 entries, the builder must create a route matrix recording old method/path, actor/roles, actual data contract, native equivalent or new port, canonical location, feature gate, and positive/negative test. A path classified unavailable is not counted as migrated functionality.

Initial families:

| Legacy family | Canonical handling |
| --- | --- |
| /en, /zh-hk and existing discovery/trip paths | Keep Journeys pages; normalize zh-hk to zh-HK once, preserving safe query parameters. Never silently rewrite other languages into English. |
| /creator, /studio and guide authoring | Keep native creator Studio where equivalent; port missing behavior and prove retained guide IDs/versions/drafts. |
| /merchants/dashboard and /merchants/dashboard/missions/:id | Resolve the real authorized merchant/company and campaign on the server; render native merchant detail or a reviewed native port. Do not redirect to an unscoped company dashboard or demo item. |
| /studio/missions/:id | Preserve native creator collaboration and approved work; current campaign is paused, participant active, submission approved. |
| /admin/missions and review routes | Port missing review functionality with operations role checks, scoped filters and version-aware review. Existing /ops behavior remains. Payout pages are not part of this acceptance scope. |
| /g/:slug, /c/:handle, article URLs | Resolve published identifiers with verified compatibility mapping; preserve metadata, language and access visibility. Unresolved private/unpublished content must not leak through aliases. |
| /auth/callback, locale callbacks, reset/sign-in/out | One canonical auth service and validated same-origin return path. Preserve reset and recovery flows. |
| API/server-action routes | Explicit ownership; never redirect POST mutations blindly. Adapt to native contracts or return a documented unavailable/retired response where the service is intentionally gated. |
| Other locales | Preserve supported public legacy content through native compatibility rendering; no invented translations. Until parity exists, do not retire their old routes. The consolidated release cannot be called complete while accepted old-language content lacks a destination. |
| AI, uploads, money, payout/provider flows | Remain gated and excluded from activation. Porting source does not authorize enabling providers, spending, publishing real offers or copying credentials. |

No blanket 301/308 to the canonical homepage. No wildcard proxy into the retired origin. No token-bearing URLs in telemetry or logs. No authentication tokens copied between browser origins. Existing users may need to sign in once on the canonical origin; test this honestly rather than transferring cookies.

## Authentication and data

Keep the current database and existing record IDs. Access is validated server-side on each request with the native actor and role/membership checks plus RLS. Preserve active merchant enforcement, optimistic review version checks and immutable approved work. All mutating ports must match current authorization and response/retry semantics before their links replace legacy entry points.

Canonical cookies remain secure, host-scoped, with the existing SSR refresh behavior. Browser storage/drafts are origin-scoped: do not claim old-origin unsaved drafts automatically migrate. Before decommission, provide a reviewed user-mediated draft export/import or recovery path where the product supports drafts, or retain the old read/recovery route until that is solved. Auth callback allowlists and email redirect settings need a scoped final configuration diff; no broad wildcard allowlist.

## Delivery sequence

1. Create an isolated codex/ consolidation branch from the reviewed KinnsoOS baseline; preserve root dirty state and never bulk-merge the divergent app trees. Commit this design and inventory separately from executable changes.
2. Complete the route/capability/identifier matrix. Compare current native vs legacy implementations and keep native behavior when equivalent. Close unknowns with source and bounded fixture tests.
3. Port merchant campaign detail/review and remaining creator/operations essentials first. Add alias/locale handling, canonical links and auth-return validation with behavior tests. Keep missing/optional features explicit and gated.
4. Build the canonical candidate against a freshly attested isolated backend. Run migration compatibility, positive/negative actor tests, duplicates/concurrent reviews, interruption recovery and existing Journeys suites. No production schema delta is presumed necessary.
5. Deploy an exact reviewable KinnsoOS preview candidate only after implementation review. Use the agreed shared-backend labeled records for authenticated browser acceptance; no seed/reset suite against production. Record which checks are local, shared-backend, browser or metadata-only.
6. Present an exact release envelope: KinnsoOS SHA, build root/project, any approved env/callback changes, route matrix completion, tests, old-host redirect artifact and rollback target. Obtain scoped production cutover approval before changing serving Journeys or retiring legacy URLs.
7. Deploy canonical origin first and verify it. Only after every in-scope legacy destination is verified, make legacy host redirect-only for safe GET/HEAD routes. Keep it as an internal rollback artifact, not another promoted product URL. Remove old-origin navigation/canonical URLs, scheduled/manual deployment instructions and mutable duplicate entry points in the final cutover. Do not delete the old Vercel project or Git history without separate scope.

## Acceptance and rollback

Success requires all accepted routes represented in the matrix, no broken deep links or lost identifier/history/draft state, preserved current Journeys tests, working canonical sign-in/recovery, two-account creator/merchant/operations browser acceptance, matching suspended/foreign/revoked denials, duplicate/interrupt/reload protection, in-app notification visibility and isolation, keyboard/mobile checks, and verified canonical metadata. Optional providers stay gated; public launch remains a separate decision.

Authorized fixtures: company ba2f54f4-a494-4ca1-ac7d-b67b7b35eca7; campaign b36941a1-57b2-4f8b-bd92-f4f2e5df12c5; participant f7312a38-59e0-4f3c-b87d-15c7b2a4183a; approved submission a76f3204-9c24-4c97-b68d-1ef5e96a123a; guide e8a5f35d-05d1-49c0-a65c-1c9d86553b59. Do not reverse approved work or suspend real user accounts to simulate test states. Destructive/reversal scenarios belong in the isolated backend.

App rollback restores the previous Journeys artifact and disables new route entries; it does not reverse security policies or restore data. Record the prior deployment before promotion. Backup/restore remains waived and must not be reported as verified. Exact redirect rollback accompanies app rollback to avoid loops.

Builder decisions delegated: module boundaries, component reuse, test file layout and route-matrix format. Scope/behavior choices are as above. No new database, paid provider, broad credential read, production role change, or public launch is authorized by consolidation planning.

## Builder review resolution

Fresh reviewer identified one scope ambiguity: whether all functional legacy routes/languages are mandatory or only selected essentials. Resolved from the user's consolidation-and-preservation request as follows: every functional legacy route and existing public-language content in the pinned baseline is mandatory for parity unless it belongs to the explicitly excluded paid AI, uploads/media, financial/provider/payout activation categories. The 104-entry matrix is exhaustive for the observed route files; supplement it with dynamic slugs and aliases discovered during inventory. Essential creator/merchant/operations routes define implementation order, not permission to discard the remainder. A missing equivalent blocks old-host retirement. Previously broken routes are inventoried as defects with a reviewed resolution, not silently counted as preserved. Optional source may be retained behind explicit unavailable gates; no currently accepted function is dropped merely to meet the cutover date. This is the agent's scope interpretation for the user's design review.
