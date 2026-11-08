# Complete Destination Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the published destination journey work at `https://kinnso-os.vercel.app` in all seven public languages, including its related public content and creator/merchant attribution, with verified visibility, mobile, keyboard and isolated-backend behavior.

**Architecture:** Parse public routes before the authenticated workbench and render them as server components with bounded anonymous readers. Keep source content in its authored form, localize only the interface, read merchant attribution from `merchant_public_profiles`, and represent empty, unavailable and omitted related sections distinctly. Preserve the existing Journeys private workspace behind its current capability and actor checks.

**Tech Stack:** Next.js 16.3.8, React 19.2.4, Supabase REST/RLS/Postgres, Node 22 test runner, Playwright 1.58.2, TypeScript 5.9.3.

**Spec:** `docs/superpowers/specs/2026-11-06-destination-discovery-design.md`

## Global Constraints

- Continue only in `C:/Users/laich/Documents/KinnsoOS/.worktrees/single-origin-design-20261105` from checkpoint `57b669f`.
- Keep `apps/journeys` as the sole serving application and `https://kinnso-os.vercel.app` as the canonical origin.
- Support exactly `en`, `zh-HK`, `zh-tw`, `zh-cn`, `ja`, `ko`, and `th`; normalize only `zh-hk` to `zh-HK`.
- Preserve authored content language and the existing `lang=""` treatment where the source language is unknown; do not fabricate translations.
- Anonymous public reads must not use `Authorization`, service-role credentials, cookies, or private actor projections.
- Read merchant attribution only from `merchant_public_profiles`; never select or embed `merchant_profiles`.
- Do not convert service failures to empty content.
- Dynamic public data remains `cache: no-store`; every response and page is bounded.
- Paid AI, uploads/media, booking/payment/payout, provider execution, RSVP submission, private role changes, old-origin draft recovery and production cutover remain excluded.
- Preserve Journeys behavior and all labeled records. Do not change production, deploy, push, run production migrations, retire the old host, or claim backup/restore.
- Backup/restore remains waived, not passed.
- Use TDD: write the named test, observe its intended failure, implement the smallest change, run focused and relevant regressions, then commit.
- Read the installed Next.js route guide before changing the catch-all route, as required by the repository instructions.

## Review Focus

- A draft, withdrawn, expired, cancelled, suspended or foreign record must disappear from lists, details, metadata and related cards on the next request.
- A backend error must render an unavailable state and must never look like a legitimately empty catalog.
- Experience and session attribution must not disclose private merchant contact fields, creator DNA, private profile JSON or suspended creators/merchants.
- A translated interface shell must not mark authored titles, bios or descriptions as translated content.
- Oversized, duplicate or malformed identifiers, filters and pagination must be rejected before an unbounded read or ambiguous selection.

## File Structure

- `apps/journeys/lib/seo/public-routes.ts`: pure public route and query validation.
- `apps/journeys/lib/seo/public-labels.ts`: seven-language interface copy projected from pinned legacy dictionaries.
- `apps/journeys/lib/seo/public-http.ts`: one bounded JSON-array transport shared by public readers.
- `apps/journeys/lib/seo/public-experiences.ts`: experience and merchant cards/details.
- `apps/journeys/lib/seo/public-merchants.ts`: PII-safe public merchant reads.
- `apps/journeys/lib/seo/public-sessions.ts`: inventory-derived discovery and exact session details.
- `apps/journeys/lib/seo/public-guides.ts`: public guide cards from published rows.
- `apps/journeys/lib/seo/destination-related.ts`: bounded related content with independent section status.
- `apps/journeys/lib/seo/PublicDestinationContent.tsx`: server-rendered destination index/detail presentation.
- `apps/journeys/lib/seo/PublicExperienceContent.tsx`: experience detail.
- `apps/journeys/lib/seo/PublicMerchantContent.tsx`: merchant attribution page.
- `apps/journeys/lib/seo/PublicSessionContent.tsx`: session index/detail without RSVP.
- `apps/journeys/lib/seo/public-presentation.ts`: canonical metadata and JSON-LD helpers for the new public pages.
- `apps/journeys/app/[locale]/[[...route]]/page.tsx`: dispatch public pages before any private actor lookup.
- `apps/journeys/app/travel/routes.ts`: recognize dynamic public destination/experience/session/merchant identifiers.
- `apps/journeys/scripts/check-public-destination-preview.mjs`: built-app, local-fixture browser suite.
- `apps/journeys/tests/real-public-content/`: owned-backend fixtures and browser acceptance.
- `apps/journeys/tests/public-phase-envelope.test.mjs`: exact evidence and SHA binding.

---

### Task 1: Public Route and Localized Shell Foundation

**Files:**
- Create: `apps/journeys/lib/seo/public-routes.ts`
- Create: `apps/journeys/lib/seo/public-labels.ts`
- Create: `apps/journeys/tests/public-routes.test.mjs`
- Create: `apps/journeys/tests/public-labels.test.mjs`
- Modify: `apps/journeys/app/travel/routes.ts`
- Modify: `docs/superpowers/specs/2026-11-06-destination-discovery-design.md`

**Interfaces:**
- Consumes: `publicLanguage(value: string): PublicLanguage | null` from `lib/seo/public-language.ts`.
- Produces: `parsePublicRoute(locale: string, route: readonly string[], query: URLSearchParams): PublicRoute | null`.
- Produces: `publicRouteHref(locale: string, route: PublicRoute): string`.
- Produces: `publicLabels(locale: string): PublicLabels | null`.
- Produces this discriminated union:

```ts
export type PublicRoute =
  | {kind:'destinations-index';page:number}
  | {kind:'destination';slug:string}
  | {kind:'guide';reference:string}
  | {kind:'creator';handle:string;page:number}
  | {kind:'experience';slug:string}
  | {kind:'merchant';slug:string}
  | {kind:'sessions-index'}
  | {kind:'session';slug:string};
```

- [ ] **Step 1: Write failing route tests**

Assert every supported locale parses `destinations`, `destinations/tokyo`, `g/reference`, `c/handle`, `experiences/city-walk`, `m/merchant`, `sessions`, and `sessions/session-one`. Assert `zh-hk` returns an href containing `zh-HK`. Assert duplicate `page`, `page=0`, `page=10001`, extra path segments, empty identifiers, percent encodings, `..`, commas and unsupported `fr` return `null`.

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node --experimental-strip-types --test tests/public-routes.test.mjs`

Expected: FAIL because `public-routes.ts` does not exist.

- [ ] **Step 3: Implement the pure route parser**

Use exact segment counts, the existing Unicode slug allowlist `/^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]{0,199}$/u`, and one shared positive page parser limited to `1..10000`. Reject duplicate recognized query keys. Use relative canonical hrefs and `encodeURIComponent` for identifiers.

- [ ] **Step 4: Write failing label and route-recognition tests**

Assert each locale has non-empty destination/list/detail/attribution/session labels and a distinct localized unavailable message. Pin the exact values to the matching `destinations`, `sessions`, `merchantProfile`, `explore`, and `footer` entries in pinned legacy source `b264c163b2d36083bab73200b84b8adf271e3e6e`, without translating authored content. Assert `isKnownRoute` accepts arbitrary safe `destinations/[slug]`, `experiences/[slug]`, `m/[slug]` and `sessions/[slug]` values while retaining current safe/demo routes.

- [ ] **Step 5: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/public-labels.test.mjs tests/catalog-route.test.mjs tests/legacy-entry.test.mjs`

Expected: FAIL because the label projection is absent and destination matching is still hard-coded.

- [ ] **Step 6: Implement `publicLabels()` and route-recognition changes**

Create one typed label projection with these sections: common retry/not-found/unavailable, destinations, experiences, merchants, sessions, creators, guides, and articles. Preserve number suffixes and localized terminology from the pinned dictionaries. Keep article labels in their existing file to avoid duplicating the already-verified article table.

- [ ] **Step 7: Mark the approved design**

Change the design status to `approved 2026-11-06; implementation follows docs/superpowers/plans/2026-11-06-complete-destination-discovery.md`.

- [ ] **Step 8: Run focused tests and TypeScript**

Run: `node --experimental-strip-types --test tests/public-routes.test.mjs tests/public-labels.test.mjs tests/catalog-route.test.mjs tests/legacy-entry.test.mjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/journeys/lib/seo/public-routes.ts apps/journeys/lib/seo/public-labels.ts apps/journeys/tests/public-routes.test.mjs apps/journeys/tests/public-labels.test.mjs apps/journeys/app/travel/routes.ts docs/superpowers/specs/2026-11-06-destination-discovery-design.md
git commit -m "feat(journeys): add public route and locale contracts"
```

### Task 2: Bounded Public Transport, Experiences and Merchants

**Files:**
- Create: `apps/journeys/lib/seo/public-http.ts`
- Create: `apps/journeys/lib/seo/public-experiences.ts`
- Create: `apps/journeys/lib/seo/public-merchants.ts`
- Create: `apps/journeys/lib/seo/public-presentation.ts`
- Create: `apps/journeys/lib/seo/PublicExperienceContent.tsx`
- Create: `apps/journeys/lib/seo/PublicMerchantContent.tsx`
- Create: `apps/journeys/tests/public-experiences.test.mjs`
- Create: `apps/journeys/tests/public-merchants.test.mjs`
- Modify: `apps/journeys/lib/seo/public-article.ts`
- Modify: `apps/journeys/lib/seo/public-destinations.ts`
- Modify: `apps/journeys/app/[locale]/[[...route]]/page.tsx`

**Interfaces:**
- Consumes: `parsePublicRoute`, `publicLabels`, `backendTarget`, `publicLanguage`.
- Produces: `readPublicRows(url: URL, key: string, transport: typeof fetch, body?: Record<string,unknown>, options?: {maxBytes?:number}): Promise<unknown[]>`.
- Produces: `readPublicExperience(slug: string, env: Environment, transport?: typeof fetch): Promise<PublicExperience|null>`.
- Produces: `readPublicMerchant(slug: string, env: Environment, transport?: typeof fetch): Promise<PublicMerchant|null>`.
- Produces: `readMerchantExperiences(merchantId: string, env: Environment, transport?: typeof fetch): Promise<PublicExperienceCard[]>`.
- Produces: `experiencePageMetadata(experience: PublicExperience, locale: string): Metadata`.
- Produces: `merchantPageMetadata(merchant: PublicMerchant, locale: string): Metadata`.

```ts
export type PublicExperienceCard={slug:string;title:string;city:string;priceAmount:number;currency:string;coverUrl:string|null;savesCount:number};
export type PublicExperience=PublicExperienceCard&{id:string;summary:string|null;description:string|null;durationMinutes:number|null;publishedAt:string;merchant:{slug:string;companyName:string}};
export type PublicMerchant={id:string;slug:string;companyName:string;tagline:string|null;city:string|null;logoUrl:string|null;websiteUrl:string|null};
```

- [ ] **Step 1: Write failing transport and experience tests**

Assert one request has no `Authorization`, uses the publishable key, `cache:'no-store'`, `redirect:'error'`, an 8-second timeout, and a 2 MB body cap. Assert experience detail binds exact slug and `status=eq.published`, then reads its merchant only from `/rest/v1/merchant_public_profiles`. Assert draft, paused, absent merchant, duplicate row, malformed price/currency/date and unsafe image values cannot produce a renderable experience.

- [ ] **Step 2: Write failing merchant and projection tests**

Assert merchant exact lookup queries only `/rest/v1/merchant_public_profiles` with the public columns. Assert `merchant_profiles`, email/contact fields, DNA/private profile fields and unsafe URLs never appear in the DTO or rendered HTML. Assert `readMerchantExperiences` binds the requested merchant ID, published/active read, deterministic `published_at.desc,id.asc`, and a maximum of 12 rows.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `node --experimental-strip-types --test tests/public-experiences.test.mjs tests/public-merchants.test.mjs`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement the shared transport and readers**

Move the current bounded array response handling from `public-article.ts` into `public-http.ts`; update article and destination readers to consume it without weakening their present byte, row and timeout bounds. Use exact-match queries, bounded lookahead where uniqueness matters, and separate merchant-public reads. Allow logos and covers only from `https://cdn.kinnso.ai`; render merchant websites only after an HTTPS URL and no-credentials check.

- [ ] **Step 5: Implement server presentation and wire exact detail routes**

Render experience and merchant pages with existing `k-pages` styles. Public content titles retain `lang=""`; interface headings use the resolved label locale. The merchant page links only to published experiences and has no enquiry form, booking CTA or payment control. Route these pages before `currentActor()` and do not mount `Workbench`.

- [ ] **Step 6: Add metadata/SSR assertions**

Extend the tests to bundle the catch-all page with a mocked private-auth module that throws if called. Render all seven locales for experience and merchant detail; assert canonical KinnsoOS URLs, selected document language, authored title `lang=""`, no old-origin link, no private fields and no private actor lookup.

- [ ] **Step 7: Run focused tests and relevant regressions**

Run: `node --experimental-strip-types --test tests/public-experiences.test.mjs tests/public-merchants.test.mjs tests/public-article.test.mjs tests/public-destinations.test.mjs tests/public-language-page.test.mjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/journeys/lib/seo/public-http.ts apps/journeys/lib/seo/public-experiences.ts apps/journeys/lib/seo/public-merchants.ts apps/journeys/lib/seo/public-presentation.ts apps/journeys/lib/seo/PublicExperienceContent.tsx apps/journeys/lib/seo/PublicMerchantContent.tsx apps/journeys/lib/seo/public-article.ts apps/journeys/lib/seo/public-destinations.ts 'apps/journeys/app/[locale]/[[...route]]/page.tsx' apps/journeys/tests/public-experiences.test.mjs apps/journeys/tests/public-merchants.test.mjs
git commit -m "feat(journeys): add public experience and merchant pages"
```

### Task 3: Public Session Discovery and Details

**Files:**
- Create: `apps/journeys/lib/seo/public-sessions.ts`
- Create: `apps/journeys/lib/seo/PublicSessionContent.tsx`
- Create: `apps/journeys/tests/public-sessions.test.mjs`
- Modify: `apps/journeys/lib/seo/public-presentation.ts`
- Modify: `apps/journeys/app/[locale]/[[...route]]/page.tsx`

**Interfaces:**
- Consumes: `readPublicRows`, `publicLabels`, `backendTarget`.
- Produces: `readPublicSessionDiscovery(env: Environment, transport?: typeof fetch): Promise<SessionDiscovery>`.
- Produces: `readPublicSession(slug: string, env: Environment, transport?: typeof fetch): Promise<PublicSession|null>`.
- Produces: `sessionIndexMetadata(locale: string): Metadata` and `sessionPageMetadata(session: PublicSession, locale: string): Metadata`.

```ts
export type PublicSession={id:string;slug:string;title:string;description:string;type:string;startsAt:string;durationMinutes:number;destinationTags:string[];status:'scheduled'|'live'|'ended';replayUrl:string|null;host:{handle:string;displayName:string}|null};
export type SessionDiscovery={status:'ready'|'empty'|'unavailable';items:PublicSession[]};
```

- [ ] **Step 1: Write failing discovery tests**

Assert scheduled/live sessions and ended sessions with replay appear; cancelled, ended without replay and malformed rows do not. Assert empty inventory returns `{status:'empty',items:[]}` and a failed request returns `{status:'unavailable',items:[]}` rather than empty. Assert the result is capped at 20 with a stable order.

- [ ] **Step 2: Write failing exact-detail and host tests**

Assert exact-slug detail independently allows scheduled, live and ended sessions under the database visibility contract while excluding cancelled. Assert the host is read separately from active public creators; an absent/suspended host yields `host:null`. Assert replay/embed values are not rendered as iframes or fetch targets; only a validated external HTTPS replay anchor may render.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/public-sessions.test.mjs`

Expected: FAIL because `public-sessions.ts` does not exist.

- [ ] **Step 4: Implement bounded session reads**

Use two bounded queries for live/upcoming and replays, merge by ID, sort deterministically and slice to 20. Keep direct detail as a separate exact query so `sessionsLive` does not gate it. Never query RSVP data.

- [ ] **Step 5: Implement server presentation and route wiring**

Render `/sessions` and `/sessions/[slug]`, localized for all seven locales, with host links and no RSVP form. Empty discovery displays the localized empty state; request failure displays unavailable. Public session detail displays authored values with `lang=""`. Route both paths before private actor lookup.

- [ ] **Step 6: Add SSR and security assertions**

Assert all seven locales render, metadata is canonical/noindex, the session title is not marked as translated, cancelled/missing responses become not-found, service failure renders unavailable, and neither `/api/session` nor RSVP writes occur during page rendering.

- [ ] **Step 7: Run focused tests and TypeScript**

Run: `node --experimental-strip-types --test tests/public-sessions.test.mjs tests/public-language-page.test.mjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/journeys/lib/seo/public-sessions.ts apps/journeys/lib/seo/PublicSessionContent.tsx apps/journeys/lib/seo/public-presentation.ts apps/journeys/tests/public-sessions.test.mjs 'apps/journeys/app/[locale]/[[...route]]/page.tsx'
git commit -m "feat(journeys): add public session discovery"
```

### Task 4: Destination Related Content and Server Pages

**Files:**
- Create: `apps/journeys/lib/seo/public-guides.ts`
- Create: `apps/journeys/lib/seo/destination-related.ts`
- Create: `apps/journeys/lib/seo/PublicDestinationContent.tsx`
- Create: `apps/journeys/tests/destination-related.test.mjs`
- Create: `apps/journeys/tests/public-destination-pages.test.mjs`
- Modify: `apps/journeys/lib/seo/public-destinations.ts`
- Modify: `apps/journeys/lib/seo/public-presentation.ts`
- Modify: `apps/journeys/app/[locale]/[[...route]]/page.tsx`

**Interfaces:**
- Consumes: Task 1 route/labels; Task 2 experience cards and merchant attribution; Task 3 session discovery; existing `readArticleListing`.
- Produces: `readPublicGuidesForTerms(terms: readonly string[], limit: number, env: Environment, transport?: typeof fetch): Promise<PublicGuideCard[]>`.
- Produces: `readDestinationRelated(destination: PublicDestination, locale: string, env: Environment, transport?: typeof fetch): Promise<DestinationRelated>`.
- Produces: `destinationIndexMetadata(locale: string): Metadata` and `destinationPageMetadata(destination: PublicDestination, locale: string): Metadata`.

```ts
export type SectionState='ready'|'empty'|'unavailable'|'omitted';
export type Section<T>={status:SectionState;items:T[]};
export type PublicGuideCard={id:string;title:string;summary:string;city:string;coverUrl:string|null;creatorHandle:string|null;savesCount:number};
export interface DestinationRelated{
  guides:Section<PublicGuideCard>;
  experiences:Section<PublicExperienceCard>;
  articles:Section<ArticleListing['items'][number]>;
  sessions:Section<PublicSession>;
}
```

- [ ] **Step 1: Write failing related-reader tests**

Assert destination terms are NFC-normalized, stripped of PostgREST separators, deduplicated case-insensitively, limited to 8 terms and 120 characters each, and combined with the destination name within a 200-character article query. Assert guides/experiences/articles/sessions issue separate bounded anonymous requests, all three article categories are searched, and each section has an independent `ready`, `empty` or `unavailable` state.

- [ ] **Step 2: Write failing page tests**

Assert `/destinations` and `/destinations/[slug]` render for every locale with localized headings and source titles in `lang=""`. Assert detail cards link to canonical `/g/{id}`, `/experiences/{slug}`, `/articles/{category}/{slug}` and `/sessions/{slug}` paths. Assert no old-origin link, no private-auth query, no entire-workbench hydration requirement, and invalid/unknown destinations render not-found.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/destination-related.test.mjs tests/public-destination-pages.test.mjs`

Expected: FAIL because related readers and destination presentation do not exist.

- [ ] **Step 4: Implement guide cards and independent related readers**

Read only `id,title,summary,city,cover_url,creator_handle,saves_count,published_at` from `guides` with `status=eq.published`. Implement one sanitizer for related terms that preserves letters, marks, numbers, spaces and hyphens. Catch failures per section and retain successful sections.

- [ ] **Step 5: Implement destination index/detail presentation**

Use semantic `main`, one `h1`, section headings in order, localizable GET links for pagination, and a retry link to the same route for service failures. Keep source-authored names/descriptions in `lang=""`. Omit empty sections; show localized unavailable text only for failed sections. The detail page performs no save/bookmark mutation; existing guide save controls remain on their current route.

- [ ] **Step 6: Wire routes and metadata before private lookup**

Extend the catch-all page so both destination routes are recognized for all seven languages and return the server destination components before `currentActor()`. Do not render `Workbench` for them. Set canonical URLs to KinnsoOS, `robots:{index:false,follow:false}`, and include only safe public JSON-LD fields.

- [ ] **Step 7: Run focused, full unit, TypeScript and build checks**

Run: `node --experimental-strip-types --test tests/destination-related.test.mjs tests/public-destination-pages.test.mjs tests/public-destinations.test.mjs tests/public-sessions.test.mjs tests/public-experiences.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: 0 failures; existing skips remain explicit.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `KINNSO_ENVIRONMENT=local KINNSO_SYNTHETIC_RUN=true npm run build`

Expected: production-mode Next build completes.

- [ ] **Step 8: Commit**

```bash
git add apps/journeys/lib/seo/public-guides.ts apps/journeys/lib/seo/destination-related.ts apps/journeys/lib/seo/PublicDestinationContent.tsx apps/journeys/lib/seo/public-destinations.ts apps/journeys/lib/seo/public-presentation.ts 'apps/journeys/app/[locale]/[[...route]]/page.tsx' apps/journeys/tests/destination-related.test.mjs apps/journeys/tests/public-destination-pages.test.mjs
git commit -m "feat(journeys): implement destination discovery"
```

### Task 5: Creator, Guide and Article Attribution

**Files:**
- Modify: `apps/journeys/lib/seo/public-creator.ts`
- Modify: `apps/journeys/lib/seo/PublicCreatorContent.tsx`
- Modify: `apps/journeys/lib/seo/public-guide.ts`
- Modify: `apps/journeys/lib/seo/PublicGuideContent.tsx`
- Modify: `apps/journeys/lib/seo/public-article.ts`
- Modify: `apps/journeys/lib/seo/PublicArticleContent.tsx`
- Modify: `apps/journeys/lib/seo/public-presentation.ts`
- Modify: `apps/journeys/app/[locale]/[[...route]]/page.tsx`
- Test: `apps/journeys/tests/public-creator.test.mjs`
- Test: `apps/journeys/tests/guide-publication.test.mjs`
- Test: `apps/journeys/tests/public-article.test.mjs`
- Test: `apps/journeys/tests/public-language-page.test.mjs`

**Interfaces:**
- Consumes: `publicLabels`, existing creator/guide/article readers.
- Produces: `creatorPageMetadata`, `guidePageMetadata` and `articlePageMetadata` for all seven locale strings.
- Produces: `PublicArticle.authorHandle: string|null`; keep `author: string|null` for existing structured-data credit.
- Produces: attribution anchors to `/{locale}/c/{handle}` from guide, article, experience and session pages when a verified public handle exists.

- [ ] **Step 1: Write failing seven-language creator/guide tests**

Assert creator and published guide routes render for all seven locales without invoking private auth, preserve authored name/bio/title with `lang=""`, localize shell and pagination copy, and keep canonical links on KinnsoOS. Assert draft/withheld/suspended guide or creator records become not-found and safe slugs redirect to the canonical guide UUID only after the publication read succeeds.

- [ ] **Step 2: Write failing article author-link tests**

Assert article reads use `/rest/v1/article_authors?select=slug,name` and return the exact handle plus localized name. Render the author as a `/c/{handle}` link only when it is a safe nonempty identifier; otherwise render the name without a link. Assert author-bio/private fields never enter the DTO.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/public-creator.test.mjs tests/guide-publication.test.mjs tests/public-article.test.mjs tests/public-language-page.test.mjs`

Expected: FAIL on unsupported locales and missing author attribution.

- [ ] **Step 4: Generalize language support and add safe author attribution**

Replace the `en|zh-HK` narrow types in public presentation with `PublicLanguage`. Preserve the legacy `zh-hk` alias only at route/input boundaries. Add verified creator links to guide/article/session attribution without changing authored text language.

- [ ] **Step 5: Move public route dispatch before private actor lookup**

Handle creator and guide paths immediately after public route parsing. Do not call `currentActor`, `serverClient`, or `Workbench` for these routes. Continue to use `legacy-guide.ts` only to resolve a published slug, and perform the canonical UUID read again before rendering.

- [ ] **Step 6: Run focused tests and TypeScript**

Run: `node --experimental-strip-types --test tests/public-creator.test.mjs tests/guide-publication.test.mjs tests/public-article.test.mjs tests/public-language-page.test.mjs tests/public-routes.test.mjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/journeys/lib/seo/public-creator.ts apps/journeys/lib/seo/PublicCreatorContent.tsx apps/journeys/lib/seo/public-guide.ts apps/journeys/lib/seo/PublicGuideContent.tsx apps/journeys/lib/seo/public-article.ts apps/journeys/lib/seo/PublicArticleContent.tsx apps/journeys/lib/seo/public-presentation.ts 'apps/journeys/app/[locale]/[[...route]]/page.tsx' apps/journeys/tests/public-creator.test.mjs apps/journeys/tests/guide-publication.test.mjs apps/journeys/tests/public-article.test.mjs apps/journeys/tests/public-language-page.test.mjs
git commit -m "feat(journeys): extend public attribution languages"
```

### Task 6: Built-App Fixture Browser and Accessibility Gate

**Files:**
- Create: `apps/journeys/scripts/check-public-destination-preview.mjs`
- Create: `apps/journeys/tests/public-preview-source.test.mjs`
- Modify: `apps/journeys/package.json`
- Modify: `scripts/check-public-article-preview.mjs`

**Interfaces:**
- Consumes: the built Next.js application, all public readers and routes from Tasks 1–5.
- Produces: `npm run check:public-destination` returning non-zero on a failed browser assertion.
- Produces: `.local-private/single-origin/destinations-preview/result.json`, explicitly labelled `LOCAL_FIXTURE_UI_ONLY`.

- [ ] **Step 1: Write a failing source-guard test**

Assert the script exists, launches only loopback backend/app origins, ignores inherited service-role and private Supabase settings, rejects non-loopback fixture URLs, sets `KINNSO_SYNTHETIC_RUN=true`, and writes evidence outside tracked source.

- [ ] **Step 2: Run the guard test to verify it fails**

Run: `node --experimental-strip-types --test tests/public-preview-source.test.mjs`

Expected: FAIL because the browser script is absent.

- [ ] **Step 3: Implement the loopback fixture backend**

Serve only documented public REST endpoints with synthetic published/unpublished fixtures, including encodings, duplicate/malformed cases and per-endpoint service failures. Assert requests have no Authorization header. Do not include credentials, service-role keys, external embeds or writes.

- [ ] **Step 4: Add built-browser assertions for every locale and viewport**

For `en`, `zh-HK`, `zh-tw`, `zh-cn`, `ja`, `ko`, `th`, at widths `390` and `1280`, with JavaScript off and on, verify:

- destination index navigation and page links;
- destination detail and each related-card canonical href;
- guide, article, experience, merchant and session detail routes;
- creator/merchant attribution links;
- localized labels and `html lang`;
- authored-content `lang=""`;
- no horizontal overflow, no old-origin application link, no external-provider request;
- keyboard focus on the first navigation control;
- missing/draft/service-error states remain distinct.

- [ ] **Step 5: Add axe checks and preserve manual evidence**

Inject the repository’s pinned axe-core into the built pages, fail on automated WCAG A/AA violations, and save screenshots plus the incomplete-check report for manual review at mobile and desktop widths. A fixture browser PASS does not claim connected backend or hosted-build acceptance.

- [ ] **Step 6: Run the built-app gate**

Run: `KINNSO_ENVIRONMENT=local KINNSO_SYNTHETIC_RUN=true npm run build`

Then run: `node scripts/check-public-destination-preview.mjs`

Expected: build succeeds and all locale/viewport/JavaScript scenarios print PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/journeys/scripts/check-public-destination-preview.mjs apps/journeys/tests/public-preview-source.test.mjs apps/journeys/package.json scripts/check-public-article-preview.mjs
git commit -m "test(journeys): cover public destination browser matrix"
```

### Task 7: Owned-Backend Visibility and Connected Browser Acceptance

**Files:**
- Create: `apps/journeys/tests/real-public-content/fixture.mjs`
- Create: `apps/journeys/tests/real-public-content/journey.spec.ts`
- Create: `apps/journeys/tests/real-public-content/target.mjs`
- Create: `apps/journeys/tests/real-public-content/result-summary.mjs`
- Create: `apps/journeys/playwright.public-content.config.ts`
- Create: `apps/journeys/scripts/real-public-content-runner.mjs`
- Create: `apps/journeys/tests/real-public-content-security.test.mjs`
- Modify: `apps/journeys/scripts/real-suite-source.mjs`

**Interfaces:**
- Consumes: existing target attestation/approval patterns and full migration tooling.
- Produces: test selection `PUBLIC_CONTENT_8`, expected test count `8`.
- Produces: an attestation containing product SHA, migration-envelope hash, isolated project/container/network/volume identities, loopback ports and seed fixture IDs, with no credentials or tokens.

- [ ] **Step 1: Write failing runner-security tests**

Assert the new runner blocks a wrong project, non-loopback origin, reused pilot/production project, stale source SHA, missing migrations, missing approval, missing evidence directory and credential-shaped evidence fields. Assert a resource/tooling failure is `BLOCKED_BEFORE_CASE_RESULTS`, never a fixture PASS.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/real-public-content-security.test.mjs`

Expected: FAIL because the new target and runner do not exist.

- [ ] **Step 3: Add an owned candidate target verifier**

Require a dedicated project name beginning `kinnsoos-public-it-`, exact loopback API/app/DB ports, owned Supabase container labels, one isolated Docker network and volume, approved source archive hash and a fresh run ID. Reuse verified target helpers only when their identity checks are at least as strict. Provision and migrate only after this preflight passes.

- [ ] **Step 4: Add full-chain and fixture checks**

Apply every ordered `supabase/migrations/*.sql` candidate through the reviewed migration tooling, verify baseline and final catalog fingerprints, then seed only owned synthetic rows: active and suspended creators/merchants, published and draft/expired experiences, published/withdrawn guides, all seven article translations plus a missing one, scheduled/live/ended-with-replay/cancelled sessions, two public creators and two private save owners.

- [ ] **Step 5: Implement eight connected browser cases**

Use one runner case per public locale plus one negative/security case. Each locale case covers destination -> guide/article/experience/host attribution -> merchant -> session and back through the canonical origin. Include mobile and desktop widths, JavaScript off/on where applicable, keyboard/reflow/axe checks, and a service-failure state. The negative case verifies withdrawal-between-requests, suspended/private data denial in list/detail/metadata, no private merchant fields, and the existing guide save/bookmark action using two accounts: account A saves the published guide, account B cannot see A's saved state, withdrawal removes the save path for new actions, and account A's saved-state read remains owner-scoped.

- [ ] **Step 6: Run locally owned backing services**

Provision the dedicated backend after its attestation precondition passes, build the exact candidate, start the app against that target, then run:

`node scripts/real-public-content-runner.mjs --preflight`

`node scripts/real-public-content-runner.mjs --run`

Expected: preflight `READY_FOR_REAL_TESTS`; run `PASS_REAL_TARGET` with exactly 8 passed and no skipped/missing case. If RAM, Docker, migrations or source identity fail, record `BLOCKED_BEFORE_CASE_RESULTS` and stop.

- [ ] **Step 7: Commit test infrastructure and safe evidence summary**

```bash
git add apps/journeys/tests/real-public-content apps/journeys/playwright.public-content.config.ts apps/journeys/scripts/real-public-content-runner.mjs apps/journeys/scripts/real-suite-source.mjs apps/journeys/tests/real-public-content-security.test.mjs
git commit -m "test(journeys): verify public content on isolated backend"
```

### Task 8: Matrix Update, Whole-Branch Review and Phase Envelope

**Files:**
- Modify: `docs/legacy-route-matrix.json`
- Modify: `docs/single-origin-implementation-status-2026-11-06.md`
- Create: `docs/public-destination-phase-envelope-2026-11-06.md`
- Modify: `.local-private/single-origin/progress.md` (private, untracked)

**Interfaces:**
- Consumes: final source SHA, unit/typecheck/build logs, fixture browser result, connected target attestation/result, route matrix and review findings.
- Produces: a reviewable phase envelope that is explicitly not the combined production release.

- [ ] **Step 1: Add a failing evidence-completeness test**

Create `apps/journeys/tests/public-phase-envelope.test.mjs`. Assert every in-scope route has source/destination disposition, tests and evidence kind; fixture evidence cannot satisfy connected acceptance; a SHA mismatch invalidates every result; and missing all-seven-locale, mobile/keyboard, accessibility or session inventory evidence keeps the envelope `NOT_READY_FOR_REVIEW`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test tests/public-phase-envelope.test.mjs`

Expected: FAIL because the envelope fields/assertions are absent.

- [ ] **Step 3: Update the 104-row matrix from evidence**

For this journey, change only rows supported by the completed tests. Keep `/{locale}/experiences/[slug]/booked` and all unrelated routes unresolved. Record local fixture, connected backend and built-browser evidence separately. A local port remains a release gate until connected acceptance passes.

- [ ] **Step 4: Run the complete final checks**

Run from the repository root:

`node --test tooling-tests/*.test.mjs`

`npm run typecheck`

`KINNSO_ENVIRONMENT=local KINNSO_SYNTHETIC_RUN=true npm run build`

Run from `apps/journeys`:

`npm test`

`node scripts/check-public-destination-preview.mjs`

`node scripts/real-public-content-runner.mjs --preflight`

`node scripts/real-public-content-runner.mjs --run`

Expected: 0 failures; skips named; TypeScript/build pass; exactly eight connected cases pass from the attested target.

- [ ] **Step 5: Obtain an independent whole-branch review**

Provide the reviewer the design, plan, route matrix, exact final SHA and evidence inventory. Fix every concrete P0/P1/P2 finding with regression tests; record security-sensitive residual findings explicitly. Re-run all evidence on the final SHA after any source change.

- [ ] **Step 6: Write the phase envelope**

Include goal, exact SHA, changed files, route table, seven-language matrix, test totals, target identity/attestation hash, fixture seed IDs, negative-security results, mobile/keyboard/accessibility results, unresolved findings and separate production status. State that production, Journeys configuration, backup/restore, database deployment, optional providers and cutover are unchanged/waived.

- [ ] **Step 7: Run the evidence test after fixes**

Run: `node --experimental-strip-types --test tests/public-phase-envelope.test.mjs`

Expected: PASS; envelope is `READY_FOR_USER_REVIEW`, not `READY_FOR_PRODUCTION`.

- [ ] **Step 8: Commit**

```bash
git add docs/legacy-route-matrix.json docs/single-origin-implementation-status-2026-11-06.md docs/public-destination-phase-envelope-2026-11-06.md apps/journeys/tests/public-phase-envelope.test.mjs
git commit -m "docs: package destination discovery acceptance"
```

## Final Completion Boundary

This phase is complete when the eight-task evidence binds to one final source SHA, the owned-backend public journey passes, and review findings are resolved. It still does not authorize production deployment or assert that the entire 104-route consolidation is ready. Remaining creator/merchant/operations parity, draft recovery, the combined production-bound envelope, old-host retirement and final device/content acceptance remain subsequent phases.
