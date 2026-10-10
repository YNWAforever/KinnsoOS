# Creator and Merchant Product Phase Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` task tracking and `superpowers:dispatching-parallel-agents` for independently owned modules. The user requested this whole implementation phase. Root owns shared integration and reviews the combined branch.

**Goal:** A native merchant-to-creator collaboration loop: merchant application and approval, company profile, campaign drafting/publication, creator applications and evidence, merchant feedback/review, historical earnings and existing redemption/team management.

**Architecture:** Extend existing Journeys BFF and authoritative PostgreSQL contracts; reuse mature missions/participants/submissions, application approval, memberships, audit and settlement rules. Preserve guide creation and existing auth/editor/media increments. Add migrations; do not mutate hosted configuration or financial enablement.

**Tech Stack:** Existing Next16.3.8/React19.2.4/TypeScript5.9.3/Supabase pins, Node tests, owned isolated CI integration and Playwright.

**Spec:** `../specs/2026-10-11-creator-merchant-phase.txt`; prior N06/N09/N11/N17 mappings in `docs/implementation/NEXT_PHASE_LEDGER.json`.

## Constraints

- Baseline main fa918c6d2c89f681071b29ac606bfbd8a24e9d0e, PR53; baseline356 unitPASS.
- Existing identity, authoritative session/roles, same-origin, bounded input, private/no-store, row ownership and idempotency remain intact.
- New campaigns are coupon-affiliate with zero-fee authored milestones. Closing maps to paused and preserves accepted work/history. No payment, budget or booking capability activation.
- New merchants submit pending applications; only existing authorized moderator approval creates active ownership. Company profile writes cannot change owner/status/tier.
- Explicit confirmation before publication/review; retries reuse immutable request intent. Version conflicts preserve input.
- Whole-phase integration PR follows the user's latest request; original first-three-only handoff sequencing is superseded, not historical evidence.

## Review focus

Cross-company/actor isolation; delayed response after account change; duplicate commands and opposite decisions after unknown responses; paused campaign's accepted work; decimal currency separation. Tests belong to the owning modules below.

## CM1 Merchant intake and owner profile (root)

Files: new `lib/merchants/onboarding.ts`, `app/api/merchant/application/route.ts`, `app/api/merchant/profile/route.ts`, `app/travel/MerchantOnboarding.tsx`, `MerchantProfile.tsx`; CLI-generated onboarding migration and unit/integration tests.
Interfaces: GET own application history/status; POST immutable application with requestId; GET owner profile; PUT allowed profile fields with expectedUpdatedAt/requestId. Owner profile and onboarding slots integrate through MerchantWorkspace.
- [x] Write failing bounded-validation and real-route tests; run RED.
- [x] Add actor-scoped, idempotent pending application and owner-only CAS profile RPCs, BFF and bilingual forms.
- [ ] Verify duplicate/retry, bad URL/privilege-field injection, rejected reapplication and forbidden company access.
- [x] Native ops review component/API reuses existing moderated approval RPC; record unknown decision resolution and reason.

## CM2 Creator collaborations and historical earnings (creator scope)

Files: new CreatorMissionsWorkspace, CreatorEarningsWorkspace, creator repository/BFF, CLI-generated collaboration migration and tests.
Interfaces: list available/mine bounded20+1, UUID detail, join/acceptInvite/withdrawApplication/submitEvidence with actor-derived ownership and timestamps; bounded earnings sections with decimal strings and currency grouping.
- [x] RED for scope/CAS/URL/request validation and real handlers.
- [x] Implement native browse/apply/evidence/resubmission/feedback and earnings (tracked/settled/payouts remain distinct).
- [ ] Verify no self-join to owned merchant, no cross-creator data, paused existing work, duplicate request and unauthorized earning reads.

## CM3 Merchant campaign lifecycle (merchant scope)

Files: MerchantWorkspace, new MerchantCampaigns/repository/BFF, CLI-generated lifecycle migration and tests.
Interfaces: bounded campaigns/detail and company counts; createDraft/updateDraft/publish/close/reviewApplication/reviewSubmission/setBranch commands. Existing team/invitations/redemption contract preserved. Owner-only submission review reuses mature audit/settlement rules.
- [x] RED for draft/publish validation, CAS, review and branch ownership.
- [x] Implement complete draft→publish→paused lifecycle, authored milestones, human review feedback, branch rename/archive and role-aware navigation.
- [ ] Verify publish prerequisites, stale edit, exactly-once effects and paused accepted work; cannot expand marketing role into submission approval.

## CM4 Integration, verification and handoff (root)

Files: Workbench/routes, notification entityLink, CSS, source manifest, end-to-end test and phase evidence/ledger.
- [x] Wire real creator/merchant routes and native inbox links; preserve explicit demo paths and guide editor.
- [x] Connect ops intake review and merchant onboarding/profile slots; keyboard/mobile styles, loading/error/empty/unknown states.
- [ ] Exercise merchant pending→moderator approval→draft→publish→creator apply→merchant approval→evidence→revision→approval→paused→history.
- [ ] Run unit/build/typecheck/package tests, root impacted checks and existing connected CI at exact branch head. Record DB/browser/environment limitations separately.
- [ ] Fresh review of combined diff, fix important issues, push isolated feature branch and create cohesive draft PR with migration/rollback/run evidence. No main merge or production SQL implied.

## Environment and status

No local Docker/owned Supabase stack is available at baseline. Do not bypass ownership checks; use existing Linux connected CI for full migrations/integration/browser verification. Public live creator/merchant pages are inspected anonymously; signed-in hosted acceptance remains separate. Preserve same-view screenshots and successful test receipts where possible.

## Review and verification checkpoint

Independent review resolved campaign SQL variable ambiguity, the browser evidence relationship query, and missing creator application feedback. Reviewer found no remaining material blocker in the final feedback diff; release remains gated on isolated CI. Local396/396 unit tests, typecheck, production build and six packaging checks passed. PR55 contains the implementation; latest main PR54 diagnostics were integrated without conflict.
