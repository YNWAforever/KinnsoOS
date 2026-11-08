# S3 — Author verification workflow (slice plan)

**Status:** in development on `release/spaces-mcp-20261108`. Live production: S2 content honesty (`dpl_HxoyDL54AUzdvKp8ka3psHmE8W1o`, ledger 241).

**Why:** S2 made content status measurable, but the only way to move a guide from `unverified` to `verified` was SQL. This slice gives authors and operations the missing workflow: authors attest and declare sources; operations independently verify place details and can label sample content. No SQL needed for either role.

## 1. The verification ladder this slice makes operable

| Step | Who | Endpoint | Result |
|---|---|---|---|
| Attest authorship + rights basis for a version | guide's creator | `POST /api/creator/guides/[id]/attest` (existing) | `attested` |
| Declare source references (title + https URL, ≤20) | guide's creator | `PUT /api/creator/guides/[id]/sources` | still `attested` until place verification |
| Verify place details (date) | operations only | `PATCH /api/ops/guides/[id]/evidence` | `verified` when attestation + sources exist |
| Label sample/fixture content | operations only | same endpoint (`synthetic: true`) | `synthetic`, never verified |

A guide remains **verified only** when attestation + ≥1 source + place verification all hold; any single missing piece keeps it `attested`/`unverified` and shows the missing requirement in the UI.

## 2. Deliverables

### Data (additive, RPC-only)
`supabase/migrations/20261109130000_author_verification.sql`
- `kinnso_creator_guide_honesty(guide_id)` — owner-only read that also works for the creator's drafts, with a `published` flag and the source list
- `kinnso_guide_set_sources(guide_id, sources)` — creator-owned, validates ≤20 `{title, url?}` with https-only URLs, atomic replace, idempotent no-op on identical content
- `kinnso_ops_set_evidence(guide_id, synthetic, place_verified_at, clear_place)` — ops-only; the independent verification act
- `kinnso_ops_published_guides(limit)` — ops-only list with derived status for the hygiene panel
- Status derivation reuses the S2 payload function so public, creator and ops views cannot disagree

### API
`GET /api/creator/guides/[id]/honesty`, `PUT /api/creator/guides/[id]/sources`, `GET /api/ops/guides`, `PATCH /api/ops/guides/[id]/evidence`

### UI
- **CreatorContentStatus** in the studio guide editor: status chip, what remains to reach verified, attestation form (rights basis + 40–2000 statement), source-reference editor with inline URL validation, and a read-only note that operations verify place details.
- **OpsContentHygiene** on the readiness page: published-guide list with derived status, source counts, place dates, synthetic toggle and place-verification date control, refresh and explicit failure states.

## 3. Acceptance

1. Creator reads own draft honesty; a non-owner gets 403/404 and never sees another creator's guide.
2. Sources: valid list saves and is reflected in counts; http/http-less/>20/bad-title payloads are rejected with 400; identical repeat is a no-op.
3. Ops marks a guide synthetic → status `synthetic`, gate blocked; ops sets a place date and clears it again.
4. End-to-end: creator attests + adds a source, ops verifies place → status flips to `verified`, readiness gate becomes ready when no synthetic content remains.
5. Ops endpoints refuse non-ops (403); anonymous calls are 401.
6. No publication/visibility change from any of these writes; content counts unchanged.
7. Typecheck, unit tests, browser acceptance, build, CI green; manifest updated; additive migration applied last with a ledger guard.

## 4. Deploy plan

Freeze the ledger (expect 241 → 242) → apply the additive migration → verify RPC grants → deploy app (`--prod --skip-domain`) → verify → promote → verify production (creator panel on an own guide, ops hygiene list for the approved ops account, non-ops 403, anonymous 401).

## 5. Non-goals

- No bulk reclassification of the nine existing guides (owner decision; the ops panel makes it a two-click operation afterwards).
- No changes to who can publish, and no automatic promotion of guides to verified.
- No article-corpus changes.

## 6. Risks

1. Attestation stays an author statement; place verification is the operations counterweight. The UI must not imply legal rights clearance.
2. Both new write paths mutate `guides`; the migration must only touch the four S2 columns and never status/visibility.
3. Creator and ops views must share the S2 derivation, or the product will show contradictory statuses.
