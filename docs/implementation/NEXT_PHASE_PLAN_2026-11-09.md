# Next development phase — plan and sequencing

Date: 2026-11-09 · Current production: `dpl_9hCWnEngh93PqmBvfuMLsukyKCMf`, ledger 243, public launch HOLD.

This document is the forward plan for the product after Studio Chat 2.0 and the S2–S5 operational slices. It exists so development stops being a sequence of reactive fixes and becomes a set of phases with explicit exit criteria.

## Where the product is today

- **Live surfaces:** public site, library and guide reader; accounts and trips; creator studio and guide editor; spaces chat with MCP tools and a real model; ops readiness (content, hygiene, health); author verification; health alerting ready to bind.
- **Evidence discipline:** each slice was additive at the database level, covered by unit tests, browser acceptance, a green six-job CI run, a staged-then-promoted deployment and a rollout receipt.
- **The one thing missing:** a single place where the launch decision is made from evidence instead of prose. That is L1 below.

## Phase 4 — Launch closure — EXIT ACHIEVED 2026-11-09 (launch-ready + packet)

Goal: make "launch" a decision that the product computes and the owner signs, not a status kept in documents.

| Slice | What | Exit criteria |
|---|---|---|
| **L1 launch control plane** ✅ shipped (+ waiver expiry enforced) | `/ops/launch` decisions inside readiness: automatic gates (content, alerting) computed from live facts, append-only sign-offs (rollback, backup, privacy, accessibility, devices, payments) with evidence notes, verdict `hold`/`launch-ready` | Verdict flips only when every required gate is accepted or waived; rejection reopens hold; every decision has an author, timestamp and note (|
| **L2 privacy and data rights** ✅ shipped | Account data export and deletion for chat/studio data; a privacy request channel (recorded requests + ops queue, not just an email address); retention statement tied to code | A user can export and delete their AI conversation data; request records are auditable; deletion removes the data it claims to |
| **L3 alert and recovery binding** ✅ resolved: transport proven, rollback drill, 2 restore rehearsals; backup waived with review date; owner can swap alert destination | Owner sets `CRON_SECRET` and `KINNSO_ALERT_WEBHOOK_URL`; backup/restore restored or explicitly waived with evidence; alert delivery exercised once end-to-end in production | A deliberately failed check reaches the owner's chosen destination; restore has been exercised or documented as a formal waiver |
| **L4 device and assistive-tech acceptance** ◐ matrix deployed; devices waived with review date pending real hardware testing | Physical iOS/Android matrix, VoiceOver and NVDA passes, focus and gesture checks on the new surfaces | Recorded pass per device/AT, or a scoped waiver in the launch panel |

Phase 4 exit = launch-ready verdict with no waivers older than the release under review, and an exportable launch packet (L1 already carries the decision data; the packet export is a small follow-up).

## Phase 5 — Paid surfaces (S6, needs owner decisions first)

Do not start building until these product decisions are made; they change the schema and the legal surface:

1. **Booking model:** request-to-book (merchant confirms) vs instant booking. Request-only is the honest first step: it needs no payment custody.
2. **Payment provider and custody:** who holds funds, when is the traveller charged, refund policy.
3. **Payouts and tax:** merchant onboarding (KYC), commission model, invoicing, regional tax handling.
4. **Trust surface:** cancellation policy, disputes, support ownership.

Suggested build order: **S6a booking requests without money — shipped 2026-11-09 (request-to-book, no payments)** (inquiries, merchant inbox, traveller status timeline) → **S6b payments and payouts** → **S6c merchant settlement tooling**. Each step gets the same slice discipline: additive migration, RPC-only access, API, UI, tests, staged deploy, receipt.

## Phase 6 — Growth and depth (first slice shipped: creator guide activity)

- Traveller-facing assistant beyond the studio (same chat backend, different tools and guardrails).
- Creator analytics: guide activity panel shipped (saves, contributions, verified status; views omitted until traveller analytics is populated).
- Discovery: ranking and personalisation with explicit controls and a "why am I seeing this" surface.
- Notifications: email/push with preference centre and consent records.
- Ops analytics: funnel, alerts history, content coverage.

## Guardrails for every slice

1. Database changes additive and RPC-only; security definer with `search_path=''`; explicit grants; no direct table access for clients.
2. Every claim verified by local acceptance against the bound stack and, where possible, a production check.
3. CI must be green before promotion; deployment is staged (`--prod --skip-domain`), verified, then promoted.
4. Rollback target named before promotion; rollback exercised at least once per phase.
5. A rollout receipt with source identity, migration ledger, verification results and open items.
6. No feature is marked done because the code exists; it is done when a user or operator can complete the flow and the evidence is recorded.

## What is genuinely blocked on the owner, not on engineering

- Fixture guides labelled synthetic (two clicks per guide in the ops panel).
- Real authors attesting authorship and sources.
- Privacy copy sign-off and the request channel decision.
- Alert destination and `CRON_SECRET`.
- Device/AT acceptance and the launch acceptance itself.
- Every Phase 5 product decision above.
