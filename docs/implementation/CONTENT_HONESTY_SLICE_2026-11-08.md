# S2 — Content honesty and authoring readiness (slice plan)

**Status:** in development on `release/spaces-mcp-20261108` (previous live release: Studio Chat 2.0 `dpl_4KeDqzSrnKn8nWwJJnjnZDiQvUwB`, ledger 240).
**Why this slice:** the content gate is the product's real launch blocker. Production publishes 9 guides with zero author-consent records, no source references and no place verification, yet the public pages present them as ordinary published guides. This slice makes the status measurable and visible instead of a claim in a document.

## 1. The rule this slice introduces

A guide is **verified** only when all three hold:

1. an author attestation exists for that guide version (ownership + rights basis + statement),
2. at least one source reference is recorded,
3. a place-verification date is recorded.

Everything else is labelled honestly:

| Status | Meaning | Public label |
|---|---|---|
| `synthetic` | explicitly sampled/fixture content | Sample content 示範內容 |
| `unverified` | published, no attestation | Unverified author-published 作者發布・未核實 |
| `attested` | author attested rights, sources/place still missing | Author-attested 作者已聲明 |
| `verified` | attestation + sources + place verification | Verified 已核實 |

Existing published guides do **not** get unpublished by this slice; they simply stop looking verified. New labels are additive and do not change guide visibility.

## 2. Deliverables

### Data (additive, RPC-only)
`supabase/migrations/20261109120000_content_honesty.sql`
- `guides.synthetic boolean`, `guides.rights_basis text`, `guides.source_refs jsonb`, `guides.place_verified_at timestamptz`
- `kinnso_internal.guide_version_attestations` (guide, version, attester, rights basis, statement, hash, time)
- `kinnso_guide_honesty(p_guide_id)` — public (anon+authenticated) read for published guides; drafts raise `guide_not_found`
- `kinnso_content_readiness()` — Ops only; counts by status plus sources/place/attestation coverage
- `kinnso_attest_guide_version(guide_id, version, rights_basis, statement)` — creator-owned; idempotent; refuses synthetic guides and foreign/draft versions; never publishes

### API
- `GET /api/guides/[id]/honesty` (catalog capability, public)
- `GET /api/ops/content-readiness` (ops capability)
- `POST /api/creator/guides/[id]/attest` (creator capability, same-origin)

### UI
- `ContentHonestyBadge` on the public guide page: compact status label + one-line explanation, never blocks the page, no invented claims.
- `ContentReadiness` Ops panel at `/{locale}/ops/content-readiness`: definitions first, then counts and a gate verdict (`ready` only when verified>0 and synthetic=0).
- Library surface keeps its existing copy; the badge is the authoritative per-guide statement.

## 3. Acceptance

1. Unknown/draft/absent guide → `guide_not_found`, API 404, badge renders nothing.
2. Published-but-unattested guide → status `unverified`, badge shows the unverified label; readiness counts it in `unverified`.
3. Creator attestation for their own version → `attested`; statement bounds enforced (40–2000), foreign guide and synthetic guide refused, different statement for same version → conflict, identical repeat → idempotent.
4. Adding source references + place verification promotes to `verified`; readiness gate flips only then.
5. Non-ops user calling readiness → `forbidden` / API 403; anonymous honesty read works.
6. No existing guide is unpublished, hidden or rewritten by the migration; content counts unchanged before/after.
7. Typecheck, unit tests, browser checks, build, CI green; source manifest updated; production apply is additive and backward compatible.

## 4. Deploy plan

1. Freeze production ledger (expect 240 → 241 after this migration).
2. Apply `20261109120000_content_honesty.sql` — additive; the live build ignores the new columns/RPCs.
3. Deploy the app from the release commit (`--prod --skip-domain`), verify, promote.
4. Verify in production: guide page badge on a real published guide (`unverified`), readiness page 403 for non-ops, 200 for the approved ops account, counts match SQL.

## 5. Deliberate non-goals

- No bulk re-classification of the existing nine guides as synthetic (that would be an unverifiable data claim); they are labelled unverified by absence of attestation.
- No creator-facing attestation form yet — the API exists and is tested; the editor UI is a follow-up (S2b).
- No unpublishing, no article-corpus rewrite, no payment/booking surfaces.

## 6. Risks

1. Attestation must not become a rubber stamp: it records rights basis + statement, but it is an author statement, not legal verification. The UI says so.
2. Readiness counts must come from SQL, not from the UI's own arithmetic.
3. The badge adds a request to guide pages; it must never delay or block the guide content (fetch after mount, render nothing on failure).
