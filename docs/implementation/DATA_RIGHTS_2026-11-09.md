# L2 — Privacy and data rights (slice report)

**Status:** implemented and verified locally (20/20 + packet 4/4); committed, CI/deploy pending.

Date: 2026-11-09 · Parent: `5237270` (L1 live, ledger 244).

## 1. What a user can now do

| Right | Surface | Behaviour |
|---|---|---|
| **Export** | `/account/data` → "Download my data" | JSON file with every space, chat, message body, guide record, creator draft payload, attestation and request history owned by the account |
| **Delete** | same page → "Delete my AI conversations" | confirmation-gated; removes spaces, chats, messages and the actor's hourly turn counters; returns counts; the new export no longer contains them |
| **Request** | same page → request form | recorded in `privacy_requests` (kind, scope, note) and listed back to the user with status and resolution note |
| **Ops response** | `/ops/readiness` → Privacy requests | queue of recorded requests with status update + resolution note; nothing is answered outside this list |

**Retention tied to code:** AI conversations persist until the user deletes them; per-actor turn counters are hourly and are cleared on deletion; exports are generated per request and never stored server-side. Published guides are not bulk-deleted: they are public content with attribution, so deleting them is a recorded request handled through the queue.

## 2. Delivered

**Migration `20261109160000_data_rights.sql`**
- `kinnso_internal.privacy_requests` (RLS on, no client grants, restricted status enum)
- `kinnso_export_account_data()` — actor-scoped export, one JSON document
- `kinnso_delete_ai_conversations()` — counts then deletes spaces (cascade threads/messages) and the actor's turn counters
- `kinnso_delete_creator_drafts()` — deletes the actor's drafts only
- `kinnso_privacy_request(kind, scope, note)` / `kinnso_my_privacy_requests()`
- `kinnso_ops_privacy_requests(limit)` / `kinnso_ops_update_privacy_request(id, status, note)` — ops-gated

**API** `GET/POST /api/privacy/data` (export, deletion), `GET/POST /api/privacy/requests`, `GET/PATCH /api/ops/privacy`; all session-gated, same-origin writes, bounded bodies.

**UI** `DataRights` page at `/{locale}/account/data` (export download, confirmed deletion, request form, personal request history, retention note); `PrivacyQueue` panel on `/ops/readiness`.

**L1 follow-up** `GET /api/ops/launch/packet` + "Download launch packet" on the launch panel — the Phase 4 exit artifact: verdict, every gate with status/decision/note, blockers and deployment identity.

## 3. Local verification

**Data rights 20/20**: anonymous 401 on all three surfaces · export contains spaces/chats with message text plus guides/drafts/attestations · request recorded (201) and listed to its owner · invalid scope 400 · deletion refused without confirmation · deletion returned real counts (15 spaces, 14 threads, 62 messages) and the subsequent export had 0 spaces · ops queue saw the request and updated it to `in_progress` with a note · account page rendered rights + history · export triggered a real JSON download · ops page rendered the queue · a second account could not see the first account's requests · non-ops got 403 on the queue.

**Launch packet 4/4**: packet endpoint returns a versioned document with 8 gates, blockers when on hold, and the download link delivers a JSON file.

## 4. Honest limits

- Deletion is permanent and immediate; there is no undo, by design, and the UI says so before confirming.
- The export is synchronous JSON; very large accounts would need a background job, which is not implemented.
- Published guides are deliberately excluded from bulk deletion; withdrawing them remains a studio action or a queued request.
- The request channel records and queues requests; it does not promise a response time in code.
