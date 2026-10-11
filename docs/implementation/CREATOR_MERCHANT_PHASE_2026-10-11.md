# Creator and merchant collaboration phase

Baseline: `fa918c6d2c89f681071b29ac606bfbd8a24e9d0e` (main / PR53). Latest main PR54 (`ad2c8ce`) was subsequently integrated; its diagnostics and prior audit ledger updates are retained.
Branch: `codex/creator-merchant-phase-20261011`.
Scope: the user's October11 request for one cohesive creator/merchant development phase, building on the existing Journeys layout and mature backend.

## Product outcome

Merchant application → moderated approval → owner company profile → authored promotion draft → publication → creator application → merchant acceptance → evidence submission → requested revision → resubmission → approval → retained history. Closing a campaign stops new applications while accepted creators finish work.

The existing guide editor/publication, team directory/invitations, branch-scoped redemption, operations queue and reconciliation continue to work. Native creator routes and inbox links no longer hand these collaboration flows back to the old development site. Earnings show recorded data per currency; they do not initiate payments or offer withdrawals.

| Task | Depends on | Implementation and acceptance | Verification checkpoint |
| --- | --- | --- | --- |
| CM1 intake | Existing moderator application contract | Pending application only; duplicate/lost-response retry retains identity; review records reason; approval creates one active company | Implemented; unit/API/component and isolated DB verified; browser follow-up in PR55 |
| CM1 owner profile | Approved active merchant | Owner-only contact fields, bounded HTTPS URLs, immutable ownership/tier/status, full timestamp compare-and-swap | Implemented; unit/API and isolated DB verified; browser follow-up in PR55 |
| CM2 creator collaborations | CM3 published mission | Bounded available/mine views, eligible application/invite response, private evidence, feedback/resubmission, no self-review | Implemented; unit/API/component and isolated DB verified; browser follow-up in PR55 |
| CM2 earnings | Existing settlement and payout records | Exact decimal strings, independent currencies, separate tracked/settled/payout categories, stable typed cursors, no write endpoint | Implemented; unit/API/component and isolated DB verified; browser follow-up in PR55 |
| CM3 campaign lifecycle | Active merchant role | Draft/edit/publish/close, authored milestones, immutable published terms, version-conflict recovery, approval before native content work | Implemented; unit/API/component and isolated DB verified; browser follow-up in PR55 |
| CM3 review and branches | Campaign participants; owner role | Written decisions, zero fixed-fee coupon review, no payment creation, human creator names, archived branch history retained | Implemented; unit/API and isolated DB verified; browser follow-up in PR55 |
| CM4 integration | CM1–CM3 | Native routes/navigation, inbox links, 320px layouts, immutable unknown retry, real three-role end-to-end case | Wired; browser regressions under verification in PR55 |
| CM4 release evidence | Exact branch CI + review | Source package rebuild, migrations, integration, browser, independent review | Code review complete; final CI tracked in PR55; hosted release pending |

## Compatibility decisions

- `missions.kinnso_requires_application` defaults false. Mature coupon missions retain direct joining; newly authored native content campaigns set it true. Creator-side legacy insert/update paths cannot turn a pending native application into accepted work.
- Monotonic timestamps cover missions, participants, submissions and merchant profiles, including older writers. Milestone edits invalidate their parent draft token.
- New writes use authoritative current sessions and roles, bounded bodies, same-origin checks, private/no-store responses, actor-scoped request receipts, and explicit compare-and-swap tokens.
- Uncertain transport results stay `UNAVAILABLE`, retain immutable intent and cannot silently become a fresh command. Operations application review can reconcile or retry its original decision after a tab reload.
- Marketing can manage briefs/applications; private submission evidence and approval remain owner-scoped. Team, clerk and finance boundaries are preserved.
- Existing paid-fee, booking, settlement and payment contracts are not replaced. New authored campaigns are coupon-only and have zero fixed creator fees.

## Verification evidence

- Baseline: 356 unit tests, all passed.
- Latest local phase run: 396 unit tests passed, zero failures/skips (including application feedback regression).
- Local production build and TypeScript checks passed.
- Corresponding-source packaging: six tests passed. All new native source/test paths are in the reviewed manifest.
- New guarded integration suites: creator collaborations; merchant campaigns; merchant intake/profile; moderator application review.
- New connected browser case: `u03-u04-collaboration.spec.ts`; existing U04 cases updated for authored milestones and written review feedback.
- Local environment has no owned Docker/Supabase stack. The ownership guard remains unchanged. Fresh migration startup and all 56 integration tests passed in the repository's isolated Linux CI at `21fa952`; zero failures/skips.
- Public live site was inspected anonymously. Authenticated hosted acceptance and hosted migrations are separate from isolated synthetic acceptance.

Checkpoint at `21fa952`: Journeys run38080407272 passed source rebuild/unit/typecheck, fresh migrations, all 56 integration cases and bilingual local Auth-mailbox tests. Its connected browser suite recorded 105 passes and three failures: an application-test read before POST acknowledgement, a 320px enlarged-English layout overflow, and ops copy in the public bundle. Root CI quality passed at this commit; the earlier `c6c0933` root CI run38079913972 completed all jobs successfully.

The follow-up waits for the actual creator POST acknowledgement and retains database assertions; moves the entire ops page wrapper into its dynamic module; and wraps merchant navigation and long headings. Isolated actual-component/CSS rendering reproduced the navigation/heading overflow and verified reflow at 320/640/1280px and doubled text. The existing N14 layout thresholds remain unchanged and now attach geometry on failure. Independent code review approved the application/bundle fixes. Final exact-code CI status and run links are maintained in [PR55](https://github.com/YNWAforever/KinnsoOS/pull/55); this checkpoint does not claim that an in-progress run has passed.

## Migration and release handoff

Apply the repository migrations in timestamp order in an approved environment:

1. `20261010190752_kinnso_creator_collaboration.sql`: creator contracts, application requirement compatibility, in-app decision notifications and read-only earnings.
2. `20261010190758_kinnso_merchant_campaign_lifecycle.sql`: campaign authoring/review, bounded progress, branch lifecycle and monotonic collaboration timestamps.
3. `20261010190951_kinnso_merchant_onboarding_profile.sql`: merchant intake and owner profile contracts.

Before hosted release, require green isolated migration/integration/browser CI, review the migrations, take the normal database backup, apply to the approved preview/staging database, and run a named owner/moderator/creator acceptance case. Enable only existing authorized capabilities. This branch does not apply production SQL, change hosted secrets, send external messages, activate payment providers, or merge main.

Rollback should disable entry to the new workflows and revert the application deployment while preserving additive schema, application history, review events and request receipts. Do not drop collaboration data or reset approval flags to bypass an incomplete workflow. Existing native campaigns requiring approval must remain gated during rollback.

## Prior audit mapping

This extends N06 creator work, N09 end-to-end acceptance, N11 merchant administration, and N17 recorded financial visibility. Earlier evidence and unapproved finance/hosted gates in `NEXT_PHASE_LEDGER.json` remain historical and must not be overwritten as completed by local unit results. This phase's release status is tracked in this document and the PR.
