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

## Operations continuation: observed 2026-10-11 Hong Kong

Read-only GitHub verification confirms main `ad2c8ceb11a57d07ffb27be91ad0011a46fab3c8` and PR55 OPEN at `097b505d5e4b79948101877f98f331d27813e8af`. Journeys run38081449970 and root CI run38081449892 both completed successfully on that exact PR source; all listed jobs succeeded. This is parent-branch evidence, not validation of the operations continuation.

Vercel deployment metadata binds the PR preview to `097b505` and the production alias to main `ad2c8ce`; both report READY. Configuration, Auth, authoritative roles, RPC/schema and signed-in hosted acceptance remain separate gates. Production has not received PR55. The preview's historical 503 requires a fresh probe and safe configuration diagnosis before its cause can be asserted.

The current-head review is COMMENTED with an unresolved P1: a legacy/direct table update can bypass immutable published campaign terms enforced only by the RPC. This is a release blocker to be covered by the P08 table-boundary work; it is not resolved by green CI.

The continuation starts from the exact PR55 head, with stacked base `codex/creator-merchant-phase-20261011`, retaining its onboarding, applications, campaign, submission/revision and read-only earnings implementations. The new [operations ledger](CREATOR_MERCHANT_OPERATIONS_LEDGER.json) preserves historical requirement IDs and records code, CI, staging and release independently. No hosted SQL, capability activation, role mutation or formal release is authorized by this appendix.

### P01–P03 local implementation checkpoint

Source `42d897edcd6aad3cad1c05347255a6656fc51540` adds a pure operator-local configuration readiness report and visible bilingual workspace recovery states. A 503 stays distinct from an empty list; 401 provides a safe return to the actual task; 403 clears denied private results. An uncertain write keeps its original intent, reads server state before replaying the same request, and stays locked after a later conflict. Moderator recovery stops after a terminal saved decision. Public API error contracts are unchanged.

P02 produced nine failing readiness cases before implementation, then nine passes plus the nine existing capability cases. P03 produced seven behavioral failures before implementation; two supplemental onboarding/moderator cases also failed against the recorded pre-fix source and passed with the fix. The committed checkpoint passed 414 unit cases with zero failures/skips, TypeScript and production build. Eight Chromium **component fixture** cases passed in EN/zh-HK, including keyboard actions and 320px/200% text. They render the real service-state component without Auth or DB. Full owned-stack collaboration browser/integration results must come from this continuation's CI. Root tooling passed 72 cases; local source-package checks collected six cases with one named Windows symlink privilege skip, which Linux CI must cover.

Read-only protected application probes on the parent preview returned `503 UNAVAILABLE` for creator missions (20:41:44 UTC) and merchant campaigns (20:53:48 UTC, 2026-10-10), both `private, no-store`. Anonymous fetches that redirected to Vercel login HTML are excluded from application evidence. Current project metadata lists the required settings only for production; no preview-target settings were listed. The connector's configuration list was forbidden, so CLI metadata was used without exporting values. This narrows the configuration investigation; effective deployment value relationships, Auth, actor and schema remain unverified. No setting, flag or schema was changed, and the preview 503 is not declared fixed.

The next gates are current-source independent review and owned CI, then the designated staging/recovery/role packet. The parent published-term table-update review remains a P08 release blocker. Production is still on main `ad2c8ce` and signed-in production acceptance is NOT_RUN.

Independent batch-A review found two P2 input-loss paths in the new conflict recovery actions. Both were reproduced as failing real-handler tests and fixed at `220990b0ce65251813a85c5e6b7eee6021b59d72`: moderator comparison reads the selected application while keeping its authored reason, and merchant comparison preserves review feedback and branch edits while refreshing server data. Related tests passed 28/28, full units 416/416 (no skips), and production build including TypeScript passed. There were no critical or deferred minor findings. [PR56](https://github.com/YNWAforever/KinnsoOS/pull/56) is stacked on PR55; current-head owned CI is pending, and these local results do not close staging/production gates.

### Batch A current-source follow-up

Exact-head Journeys push run38086127125 passed at `ed339ad7ebe2ef4f24dee75dbcb21ed781acc347`: 416 unit, 56 integration, 116 browser and four isolated Auth-mailbox cases, zero failures/skips. The 116 browser cases combine the existing 108 owned-flow cases with eight real-component fixtures; they do not establish hosted UAT. Linux source-package checks and extracted-source rebuild passed. PR run38086129398 tested merge `a6df909` whose tree equals the exact branch tree; root PR CI38086129467 succeeded.

A subsequent real-component regression found that disabled creator services with a signed-out actor offered login before service unavailability. The test failed before the correction at `036be6772c6a718c9e44b3f03bbd9d2b968fc7cf`, then full units passed 417/417 without skips and production build including TypeScript passed. The two services now report unavailability without a read or login loop when disabled. The new current head needs fresh owned CI; the prior green run remains historical. Staging and production role acceptance remain NOT_RUN.

### P07 isolated workbench checkpoint

Source `5c7fc9f365fcf86d4c183fa849d0a6fbe61abcc5` places next actions ahead of creator guides and merchant campaigns, using only the existing authorized bounded summaries/selected detail. Cards distinguish my work, waiting and completed records, keep real record/company links and clear prior-actor results. No cross-page total, proof copy, new financial command or capability activation is added. Summary-only creator records lead to their existing detail rather than claiming unobserved milestones.

Ten new behavior regressions were observed RED before implementation. Independent review found two P2 issues: self-review next actions and an index-dependent agent chunk hold in the browser regression. The self-review case was reproduced RED, then the selector received current actor identity and excluded self rows while retaining other-creator success controls. The existing lazy-logout test now uses a named agent marker and retains its real chunk/broadcast/server-denial assertions. No critical or deferred minor findings. Current-source local units passed 428/428 without skips; production build including TypeScript passed. Six real task component Chromium layout cases passed at b07267f (EN/zh-HK, 320/640/1280px, doubled text/keyboard), alongside eight P03 fixture cases. New connected owner/creator cases and full private-bundle regression await owned CI; hosted acceptance remains NOT_RUN.

P04-P06 delivered staging prerequisites, H01-H14 hosted acceptance and M1 recovery/gate documents at848d7e, with runtime BLOCKED_TARGET / NO_GO. Required environment/actor/recovery information remains pending. P08 is the next isolated implementation and retains the parent published-term table-update release blocker.

### Current A/P07 CI and P08 implementation

PR56 source `d1829cefd8b8b0bdfd6faa0f6eb456675efc2eb1` passed Journeys run38087768841: 417 unit, 56 integration, 116 browser and four isolated mailbox cases, zero failures/skips. Its tested merge `44ca04899edcaa84d07804366ecfafce69dad37c` has the exact head tree; root run38087768835 succeeded. PR57 source `ba3d5434f57936e4a6cac450065930591546fe06` passed run38087866289: 428 unit, 56 integration, 124 browser and four isolated mailbox cases, zero failures/skips. Its tested merge `53ce6da19d961ffb083594083bab6db0b639503e` has the exact head tree; root run38087866406 succeeded. Both Linux source packaging/rebuild/type checks passed. Both PRs are open for review; no merge was performed.

The matching current preview deployments report READY, but protected creator/merchant API probes still returned private/no-store 503 at 21:53 UTC on 2026-10-10. Signed-in staging and production acceptance remain NOT_RUN. Production's observed source remains main `ad2c8ce`.

P08/#58 code checkpoint `0021f821d6cd6f2a6e58d9020cc1602e9c3b69e2` adds application windows with explicit instants/IANA display timezone and table-boundary published-term protection. Native and legacy admission checks evaluate wall clock after locking; accepted proof/revision rights and v1 omitted-date updates are preserved. Legacy mission creation now authors milestones before CAS publication and reconciles an uncertain publish response against its existing draft ID. Ops auto-approval keeps its audited setter and fresh-session gate; direct owner policy changes, published deletion/recreation and term rewind are denied. Historically published draft-shaped rows truthfully advertise read-only terms; immutable failures become terminal conflicts. The mature receipt default milestone is authored and sealed in the same insert transaction.

Test-first baseline run38088065771 reproduced two new unit and two new integration failures while all 56 pre-existing integration cases passed. Fresh independent review found four important and one minor issue, no critical issue; before fixes run38089717306 reproduced one new error-mapping unit failure and three new policy/delete/history integration failures. Held cutoff/close/legacy-native contention controls passed. The run also exposed receipt default-milestone compatibility and an ops-scale timeout; their complete current-source regressions still require CI. Fixes pass 432 local units with no skips, TypeScript and production build; the three legacy creation baseline failures become 38 related passing units. The borrowed-dependency whole legacy typecheck did not pass, so full legacy validation remains assigned to canonical CI. Current owned/root CI is pending. This source has not been migrated to any hosted target.

Root run38090289725 at0021f821 failed only the settlement suite afterAll direct deletion of sealed milestones; all eight settlement assertions passed and E2E was skipped. Cleanup now deletes the owned parent and uses its existing FK cascade, retaining immutable terms and the same financial assertions. This correction awaits fresh canonical CI.

P10 independent stack: PR #60 branches from verified P08 `a0c43bf`, beside P09 PR #59. Native server list filters allow bounded literal title/summary search and scope-specific statuses, with 20+1 paging; v1 tokens bind actor/company/filter/order plus current anchor. Recent uses immutable createdAt/id; deadline uses unfinished dueAt/id, null last. Existing summary/detail/review RPCs remain authoritative. UI retains URL scope/filter state, load-more, clear, filtered-empty and explicit refresh without claiming a multi-page snapshot. Initial owned RED run `38092915404`: 432/436 unit and 65/68 DB integration, 0 skipped. Local candidate 437 unit/types PASS; query SQL, repeatable receipt completeness and 2 native browser stories remain pending. No hosted SQL or capabilities changed; no new index before EXPLAIN.
