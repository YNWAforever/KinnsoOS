# KinnsoOS first integration milestone

Goal: preserve the Kinnso Journeys layout and working device-local travel tools while introducing a tested boundary to the established published-guide data model.

Architecture: independent Next.js App Router application. Reuse the publicly distributed Journeys GPL source at 9f7eaba1. Implement a new server-side, anonymous, read-only PostgREST adapter. Keep canonical writes on the existing application until session/RLS/migration verification is complete. No private Remix-Kinnso source files are published in this milestone.

## Scope and order

- [x] Preserve travel layout, itinerary clone/edit, map, recording and local recovery tests. Keep sample/commercial actions labelled demo.
- [x] Add published-guide catalog: bounded pagination, search, explicit unconfigured/error/empty states, schema validation and safe source links. Do not invent stops for summary-only guides.
- [x] Add a coherent integration workspace for creator, merchant and operations handoffs; state clearly that old-origin login remains separate.
- [x] Split non-traveller workspaces into lazy chunks; compress existing local photos; preserve provenance and GPL source access.
- [x] Verify adapter contracts, retained local state invariants, TypeScript and production build. Verify rendered routes and document live-service blockers.
- [x] Initialize the named GitHub repo with only reviewed public-source/new code. Do not copy private history, database rows, credentials or operational evidence.

## Test cases

Catalog: missing config; reject privileged keys; malformed data; empty successful response; upstream timeout/401/500; pagination ceiling; search punctuation; next-page state; safe HTTPS cover; invalid slug; no invented itinerary.

Travel: independent copied trip; source retained; save/reload; stale revision rejection; private notes excluded from public preview; storage failure; duplicate actions.

Integration: sample persona never becomes production identity; links use canonical allowlisted origin and locale; no credential forwarding; no automatic financial or notification actions.

## Deferred production gates

Authenticated backend browser UAT; isolated staging Supabase target; rich itinerary/media schema and ownership policies; account migration; transactional redemption/payout regression tests; AI grounding and rate limit testing; full mobile/browser field-performance measurement. These are later milestones, not claims of this build.

## Integration follow-up

Reconcile the existing application’s pending personal-trip and accessibility work before designing a new persistence schema. Do not treat a branch migration as deployed database state. Trip revision semantics, media storage and account session continuity need staging acceptance before local demo writes can become production writes.

Verification on 1 October 2026: local production build and TypeScript passed; adapter and retained model tests passed; HTTP route smoke passed. The cloud browser could not reach localhost, so browser UAT of this new app remains NOT RUN. No live Supabase configuration was supplied.
