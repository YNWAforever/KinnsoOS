# S3 — Author verification workflow report

**Status: implemented and locally verified (19/19), committed and CI running. Production still runs S2 (`dpl_HxoyDL…`, ledger 241).**

Date: 2026-11-09 · Worktree `.worktrees/single-origin-design-20261105` · parent `e67a5a2` (live S2 release).

## 1. What this slice adds

Authors and operations can now move a guide from `unverified` to `verified` without SQL:

| Step | Actor | Surface |
|---|---|---|
| Attest authorship + rights basis for a version | guide's creator | `POST /api/creator/guides/[id]/attest` (existing) + new **CreatorContentStatus** panel in the studio editor |
| Declare source references (title + https URL, ≤20) | guide's creator | `PUT /api/creator/guides/[id]/sources` + same panel |
| Verify place details / label sample content | operations only | `PATCH /api/ops/guides/[id]/verification` + new **OpsContentHygiene** panel on `/ops/readiness` |
| Read own progress (drafts included) | guide's creator | `GET /api/creator/guides/[id]/honesty` |
| List published guides with derived status | operations only | `GET /api/ops/guides` |

A guide is `verified` only when attestation + ≥1 source + place verification all hold; the creator panel lists exactly what is missing, and "verified" is never derived from local state — only the server's answer counts.

## 2. Delivered

**Migration** `supabase/migrations/20261109130000_author_verification.sql` (additive, RPC-only, security definer, `search_path=''`, revoked from anon):
- `kinnso_creator_guide_honesty(uuid)` — owner-only, drafts readable, payload adds `published` + `sources[]`
- `kinnso_guide_set_sources(uuid, jsonb)` — creator-owned, validates ≤20 `{title, url?}` items, https-only 1–500 chars, atomic replace, identical repeat is a no-op
- `kinnso_ops_set_evidence(uuid, boolean, date, boolean)` — ops-only synthetic label + place-verification date (set/clear), writes only those two columns
- `kinnso_ops_published_guides(integer)` — ops-only list with derived status
- Status derivation reused from the S2 payload function, so public/creator/ops views cannot disagree

**API** `GET /api/creator/guides/[id]/honesty`, `PUT /api/creator/guides/[id]/sources`, `GET /api/ops/guides`, `PATCH /api/ops/guides/[id]/verification`
**UI** `CreatorContentStatus` (status ladder, missing-steps list, attestation form with live 40–2000 count, source editor with inline https validation, read-only ops place note) mounted in the studio guide editor; `OpsContentHygiene` (published guides, status chips, synthetic toggle with inline confirmation, place date set/clear, refetch after every mutation) mounted under the readiness page.

## 3. Verification

| Check | Result |
|---|---|
| TypeScript | PASS |
| Unit tests | **2037 pass / 2 skip / 0 fail** (baseline 2014 + 23 new author-verification tests) |
| Production build | PASS |
| Local migration | applied; 4 RPCs present; PostgREST reloaded |
| Chromium acceptance | **19/19 PASS** |

Acceptance highlights: creator reads own guide; http URL rejected (400); valid https source saves (sourceCount 1) and identical repeat is a no-op; short attestation rejected; attestation records → `attested`; creator editor renders the panel with `data-status="attested"`; non-creator cannot read creator honesty (403); ops list returns 3 rows; ops sets place verification → `verified` publicly; synthetic label toggles on/off; place verification clears; ops page renders the hygiene panel with 3 rows; non-ops 403; anonymous creator/ops endpoints 401.

## 4. Defects found and fixed during integration

1. **PostgreSQL ARE rejects `\s` inside a bracket expression.** The generated URL check `'^https://[^[:space:]]{1,500}$'` fails at runtime with `invalid regular expression: invalid repetition count(s)`. Replaced with explicit checks (prefix `^https://`, length 1–500 after prefix, `~ '\s'` outside brackets) and a regression test asserting the new SQL shape.
2. **Packaging policy rejects a path segment named `evidence`.** The ops route moved from `/api/ops/guides/[id]/evidence` to `/api/ops/guides/[id]/verification` (also updated the UI and tests), because `scripts/package-source.py` treats `evidence` as a forbidden path component.
3. **Editor test harnesses** compile `CreatorWorkspace.tsx` and throw on unknown modules; the new panel needed an explicit stub in the publication-readiness and creator-editor harnesses.
4. The new component must not fetch in sandboxed runtimes: it renders nothing without fetch/AbortController, matching the S2 badge convention.

## 5. Deploy plan

Freeze ledger (expect 241 → 242) → apply the additive migration → deploy the release build (`--prod --skip-domain`) → verify → promote → verify production: readiness page renders both panels; anonymous creator/ops endpoints 401; an ops account (not available to the Lead) confirms the list and date control; public guide status unchanged (no data mutated by deploy).

## 6. Limits

- Attestation remains an author statement; place verification is the independent operations counterweight. No claim of legal rights clearance.
- The nine production guides are untouched by this deploy; the ops panel makes the synthetic/labelling decision a two-click action once the owner decides.
- Creator UI was verified against the local stack with fixture guides; its production behaviour depends on a real creator account (the Lead has none).
