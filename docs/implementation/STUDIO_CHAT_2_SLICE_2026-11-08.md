# Studio Chat 2.0 — next-stage slice and product roadmap

**Status:** in development on `release/spaces-mcp-20261108` (local only; production currently runs the Studio/MCP v1 release `dpl_3sos4jsutow4UCFREbpYLXWA1Q2U`).
**Decision context:** spaces + MCP chat is live behind sign-in; the remaining gaps are product depth, content honesty, accessibility and operational readiness. This document fixes the next slice and the order of the stages after it so work stops being a list of unrelated fixes.

## 1. Where the product actually is (verified 8 Nov 2026)

| Area | State | Evidence |
|---|---|---|
| Public site + library | Live, fixture content only | `/zh-HK` 200; content gate FAIL (9 guides, 0 consent records) |
| Account services | Live | trips, bookmarks, creator, merchant, ops, notifications |
| Studio workroom (`/workroom`) | Live, template flows with source-excerpt mode | `/zh-HK/workroom` 200 |
| Spaces chat (`/spaces`) | Live since `dpl_3sos4j…`, real model + MCP tools, 30 turns/actor/hour | CI 42475987906; prod verification 8 Nov |
| Pilot control room | Deployed, launch HOLD | pilot tables + RPCs now present in production (ledger 239) |
| Privacy for AI chat | **Gap**: code now carries an AI-processing section + in-chat notice, not yet deployed | this slice |
| Accessibility / devices | Not run | recorded NOT_RUN |
| Alerts / support owners | Not bound | recorded blocker |

## 2. This slice — Studio Chat 2.0

Goal: make the live chat surface something a real user can use for a working session, not a demo.

| # | Capability | Why it matters |
|---|---|---|
| 1 | Rename / archive / delete spaces and chats, pinned chats | users accumulate chats; without organisation the surface degrades after a week |
| 2 | Search across spaces, chats and message bodies | same reason; also the cheapest answer-history feature |
| 3 | Stop / regenerate / retry / copy | model turns take ~10s; no stop or retry makes the surface feel broken |
| 4 | Source cards for tool results | MCP grounding is invisible today; links to guides/trips make it verifiable |
| 5 | Per-message metadata (model, latency, tool count) | observable behaviour, honest about what answered |
| 6 | Usage meter + 429 handling | the cost guard exists in SQL but users cannot see it |
| 7 | AI-processing notice + privacy section | production compliance gap from enabling the model |
| 8 | Mobile/keyboard/a11y pass on the chat | 320–1280 layouts, Esc stop, focus rings, aria-live |

Acceptance for this slice: typecheck + unit tests pass, the full browser suite on the isolated stack covers every item above plus reload persistence and second-account isolation, and the source manifest includes every new file so CI can build.

## 3. Stage plan after this slice

Ordered by dependency and by what a launch decision actually needs. Each stage ends with its own evidence, not a shared PASS.

### S1 — Studio Chat 2.0 (this slice)
Exit: listed acceptance above.

### S2 — Content honesty and authoring readiness (the real launch blocker)
The content gate is the product's biggest gap: fixture guides presented as published.
- Mark fixture/synthetic records in data (`guides.synthetic boolean` + review metadata) and surface an explicit label in the library, guide reader and search results.
- Creator consent record: author attests authorship and rights, per guide version; store attestation + rights basis; block public projection without it.
- Source references and place-verification dates as required fields for a "verified" badge.
- Admin read-only readiness view: counts of published vs synthetic vs consented, so the gate stops being a doc claim.
Exit: no unlabeled synthetic content is publicly reachable; a real guide can be on-boarded through the attested path; readiness counts reproducible from SQL.

### S3 — AI chat hardening and continuity
- Conversation memory across spaces (summaries, not raw history), deterministic context budgets.
- Streaming tool-call previews and structured error taxonomy surfaced in UI.
- Rate limits per model class and per workspace; observable usage history.
- Chat export (Markdown/JSON) and per-account data deletion that is actually executed, not just described.
Exit: cost/abuse controls demonstrated; export/delete verified against production-shaped data.

### S4 — Accessibility and real devices
- Keyboard and screen-reader pass across spaces, workroom and role workspaces; axe in CI.
- Physical iOS/Android checks; VoiceOver/NVDA.
Exit: recorded PASS or explicit scope exclusion per surface; no shared "mobile-ish" claim.

### S5 — Operational readiness
- External alert binding (error-rate, provider failure, budget exhaustion), runbook + on-call owner.
- Rollback rehearsal for app + additive DB changes; restore drill if backup policy is reinstated.
Exit: a failed deploy triggers a delivered alert to a named owner and the runbook is followed once.

### S6 — Paid and partner surfaces (only after S2/S5)
Bookings, payments, payouts, provider connections stay disabled until their own approved sandbox acceptance; the MCP/creator/merchant flows already exist but must not be marketed as live.

## 4. Deliberate non-goals in this slice

- No new visual redesign of the public site.
- No real content authoring UI for creators (S2 scope).
- No payments, bookings, media activation or provider OAuth.
- No changes to the pilot control room.
- Nothing is promoted to production without the staging packet and explicit approval.

## 5. Risks tracked during this slice

1. Server and UI teammates edit disjoint files; integration is by the Lead after both land, with a single build and browser pass.
2. New files must be added to `apps/journeys/scripts/source-manifest.json`, otherwise CI fails exactly like the last release (`Can't resolve '../workroom/SpacesApp'`).
3. The new migration replaces `chat_append_message` (6→7 args). Deployed app code and migration must move together; production currently has live chat tables but no user data yet in spaces.
4. Privacy wording must be reviewed by the owner; the current text is a draft disclosure, not approved legal copy.
