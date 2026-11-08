# Complete destination discovery

Status: approved 2026-11-06; implementation follows
`docs/superpowers/plans/2026-11-06-complete-destination-discovery.md`.

## Intent and selected approach

Complete one public visitor journey inside KinnsoOS: browse destinations, open
a destination, read its published guides/articles/experiences, and follow their
public attribution links without returning to the legacy application. This is
the next phase of the approved single-origin consolidation, not a public launch.
Existing Journeys behavior must remain intact.

Approaches discussed with the user:

1. Complete one visitor journey, including its linked pages and connected tests.
   This delivers usable coverage sooner, but ports fewer unrelated route families.
   **Selected by the user** after the recommendation on 2026-11-06.
2. Port all remaining public pages before connected testing. This expands route
   coverage sooner but delays discovery of integration and visibility failures.
   Not selected for this phase; remaining routes stay required for final cutover.

This is a project-sized phase spanning public reads, routes, language behavior,
and isolated-backend acceptance. It is not a redesign of the product or a new
content-generation effort.

## Baseline and constraints

- Continue the existing `codex/single-origin-design-20261105` worktree from local
  checkpoint `3db95b9`; preserve unrelated main-checkout edits.
- Keep Next.js/React in `apps/journeys` as the serving application. Reuse native
  contracts; consult the installed Next.js guides before modifying routes.
- Article hub/category/detail routes have seven-language local fixture coverage.
  Destination index/detail readers exist in `lib/seo/public-destinations.ts`, but
  no destination UI or connected acceptance is claimed by that checkpoint.
- Existing public guide slug resolution and creator pagination can be reused;
  they do not establish five additional public languages or linked-page parity.
- Canonical public origin is `https://kinnso-os.vercel.app`. No second serving app,
  wildcard legacy proxy, or old-host fallback links.
- No production push/deploy/configuration/schema/role/content changes in this
  phase. No old-host retirement. Backup/restore remains waived, never passed.
- Use existing database contracts and suspension rules. If those cannot support
  required behavior, report the exact gap and prepare a separately reviewed delta;
  do not weaken visibility or silently introduce a production migration.

## Scope and endpoint of the journey

Implement destination index and exact-slug detail. The index has deterministic
bounded pagination; detail retains the legacy related guide, article, experience
and product-gated session sections. Port the public detail pages and public
creator/merchant attribution pages reachable from these content cards. Existing
native pages are retained when their behavior satisfies the contract.

The scope boundary is public discovery and reading. The connected path ends at
the content detail and its public creator/merchant attribution. Links into other
existing native flows must resolve correctly, but this phase does not implement
new booking, checkout, private workspace, team-management or review capabilities.
Do not recursively expand scope through every global navigation link. Record
unrelated missing routes in the master matrix; do not mark them accepted.

Ordinary existing guide save/bookmark controls must retain their current native
sign-in, authorization and persistence behavior. If a newly ported detail exposes
an equivalent existing nonfinancial save action, include it in connected tests;
do not add an inert control or invent a new action. Preserve existing saved state.

Session discovery preserves the legacy inventory-derived `sessionsLive` rule:
public scheduled/live inventory or an ended session with a replay makes discovery
available. This is not a new environment feature flag. Empty inventory omits the
destination section; a failed read displays unavailable rather than pretending
inventory is empty. Direct session detail uses its own public visibility contract,
not the discovery indicator. Verify public listing/detail and host attribution
with available and absent inventory in the owned test environment. Preserve safe
public replay references, but do not execute external embeds, broadcasts or paid
provider calls. RSVP submission is outside this public-reading phase and remains
an explicit unaccepted workflow in the master matrix; do not present an inert RSVP
form as completed functionality.

Explicitly excluded: paid AI, media uploads, payment/booking/payout activation,
external provider execution, new authored travel content, private role changes,
old-origin draft recovery implementation, and production cutover. These exclusions
do not discard historical read-only records or outstanding consolidation gates.

## Public data and visibility contract

- Use anonymous public reads for public inventory; never elevate through a service
  role or forward an authenticated actor merely to make public content readable.
- `destination_index` is the existing security-invoker projection of published
  inventory. Retain its curated/generated identities and counts. Do not manufacture
  destinations from labels or silently convert failed reads into empty arrays.
- Read related guides and experiences through their published/public contracts,
  preserving destination matching semantics while validating and bounding terms.
  Avoid raw filter interpolation; allow Unicode combining marks where appropriate.
- Experience merchant attribution comes from `merchant_public_profiles`, never
  the PII-bearing `merchant_profiles` table or a private embedded join.
- Recheck publication at each detail request. Revoked, draft, foreign/private,
  suspended or unavailable records must not become readable through a slug alias,
  metadata, attribution, caching, pagination or a related-content card.
- Apply existing article publication/expiry/translation rules. Destination article
  matching retains all legacy categories and terms; do not restrict it to the
  destination article category because the current category reader is convenient.
- Use bounded projections, response sizes, timeouts and page limits. Validate
  duplicate/ambiguous identity and reject malformed query controls before fetch.
- Dynamic data stays uncached unless an independently verified invalidation policy
  proves that withdrawal and suspension cannot leak cached public content.

## Language and presentation behavior

Support `en`, `zh-HK` (legacy `zh-hk` alias), `zh-tw`, `zh-cn`, `ja`, `ko`, and `th`.
Retain authored-language lookup for articles; never substitute another authored
translation. Source destination/guide/experience names are not translated merely
because the interface locale changes. Preserve existing source-language semantics
and distinguish them from localized navigation labels.

Reuse existing Journeys components and the pinned legacy dictionaries. The agent
proposes this reuse to minimize regressions; the user has selected the journey,
not a new visual redesign. All relevant cards and attribution links use canonical
relative paths with safely encoded identifiers. Page metadata and document language
must match the selected public route. Do not claim translation coverage for missing
authored content.

Empty published inventory, absent translation, invalid route, unpublished detail,
and failed service are different states. Invalid/missing detail returns not-found;
service failure offers a localized retry state and must not claim zero content.
Independently failing related sections may retain successful sections but must
display the affected section as unavailable. Broken cards must not be presented as
working links. Pagination preserves filters, is keyboard-operable without JavaScript,
and rejects impossible/duplicate page controls. Do not silently truncate inventory.

## Verification and acceptance

Provision an owned candidate-specific local backend using the repository's
existing isolated-test tooling. First verify project/container/network/volume/port
ownership and exact source identity. Never reuse the running pilot backend or
production as a disposable fixture target. Keep credentials and private evidence
out of commits. Resource/tool failures remain explicit blockers, not fixture PASS.

Run the full applicable migration chain and seed synthetic published/unpublished,
translated/missing-translation, active/suspended, and two-account fixtures only in
that environment. Record source SHA, migrations, application configuration and
environment identity in the attestation. Test ordinary anonymous reads and any
existing save action using real Auth/RLS behavior, not a mocked service response.

Acceptance requires:

1. Destination index -> detail -> each applicable related-content detail -> public
   attribution works at the canonical route shape in all seven interface locales.
2. Exact identifiers, encoded Thai/Chinese slugs, pagination/filter retention,
   unknown routes, missing translations, empty inventory and service failure behave
   as specified, with no old-origin application links or fabricated content.
3. Draft/withdrawn/suspended visibility is denied in listings, detail and metadata,
   including withdrawal between requests. Two accounts cannot see each other's
   private saves or bypass revoked access; public views do not expose private fields.
4. Session discovery is verified with present/absent public inventory and failed
   reads; direct detail visibility is tested independently, without provider execution.
5. Built application browser checks cover desktop and representative mobile widths,
   JavaScript enabled/disabled for public reading, keyboard navigation, visible focus,
   heading/label structure, overflow, and an accessibility scan with manual review.
6. Relevant Journeys regressions, full unit suite, TypeScript and production-mode
   build pass. Fixture, connected-backend and browser evidence are recorded separately.
   A webpack local build does not certify the hosted default build.

## Deliverables and completion boundary

Deliver native route/component/service changes, tests, candidate attestation,
review findings and resolutions, and an updated route matrix with exact evidence
for this journey. Freeze the final phase SHA after review; do not attach older
candidate evidence as though it verified newer source.

Completing this phase does not mean all 104 routes are migrated or the release is
ready for production approval. Remaining creator/merchant/operations parity,
draft recovery, final target/envelope verification and old-host retirement still
gate the combined release. Prepare production approval only after that complete
release is concrete and reviewable.

## Builder decisions

The builder may choose module boundaries, component reuse, fixture names, exact
test files, safe bounded query batching and concrete mobile viewport sizes. These
choices must preserve the contracts above. Do not change the chosen platform,
enable providers, drop required languages or broaden the scope into paid actions.

After the user approves this design, invoke `superpowers:writing-plans` to produce
the implementation plan. No product implementation is authorized by this document
while its status remains awaiting approval.

## Builder review

A fresh independent builder reviewer reported "nothing important left" on
2026-11-06. Source verification additionally corrected the session availability
contract above: `apps/web/lib/product-state.ts` derives availability from public
inventory, while direct session detail performs a separate visibility lookup.
This correction introduces no production configuration change.
